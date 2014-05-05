var fs = require("fs");
var dorian = require("./dorian");
var Q = require("q");
var _ = require("lodash");
var moment = require("moment");
var winston = require('winston');

(function (undefined) {
  "use strict";

  var logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({
        json: false,
        timestamp: true,
        level: 'debug',
        colorize: true
      })
    ],
    exceptionHandlers: [
      new (winston.transports.Console)({json: false, timestamp: true})
    ],
    exitOnError: false
  });

  function sequence(arr, fn, async) {
    if (async) {
      return Q.all(_.map(arr, fn));
    } else {
      if (arr.length === 0) {
        return Q.fcall(function () { return []; });
      } else {
        return Q.fcall(fn, arr[0]).then(function (result) {
          return sequence(arr.slice(1), fn, async).then(function (results) {
            return [result].concat(results);
          });
        });
      }
    }
  }

  function withWindow(content, f) {
    var deferred = Q.defer();
    if (typeof window === "object" && window) {
      deferred.resolve(window);
    } else {
      require("jsdom").env(
        content,  // HTML content
        [],       // JS libs
        function (err, window) {
          if (err) {
            deferred.reject(err);
          } else {
            var scripts = window.document.querySelectorAll("script");
            _.each(scripts, function (script) {
              var src = script.getAttribute('src');
              if (src && src.match(/^(.*\/)?dorian.js$/)) {
                script.parentNode.removeChild(script);
              }
            });
            deferred.resolve(window);
          }
        }
      );
    }
    return deferred.promise;
  }

  function createDir(dirs, async) {
    return sequence(dirs, function (dir) {
      return Q
        .ninvoke(fs, 'mkdir', dir).catch(function (err) {
          if (!err || err.code != 'EEXIST') { throw err; }
        });
    }, async);
  }

  function logAndTime(name, fn) {
    var start = moment();
    function diff() { return moment().diff(start); }
    logger.info(name + " ...");
    return Q
      .fcall(fn)
      .then(
        function (res) {
          logger.info(name + " ... OK [" + diff() +"ms]");
          return res;
        },
        function (err) {
          logger.info(name + " ... ERROR [" + diff() +"ms]");
          throw err;
        }
      );
  }

  function renderFile(name, src, dst_static, dst_dyn, async) {
    return logAndTime("render file " + src, function () {
      return logAndTime("read file " + src, function () {
        return Q.ninvoke(fs, 'readFile', src, "utf8");
      }).then(function (content) {
        if (/\.html$/.test(name)) {
          return withWindow(content).then(function (window) {
            return logAndTime("render file " + src, function () {
              return dorian.render(window, {logger: logger});
            }).then(function () {
              return [name, content, window.document.innerHTML];
            });
          });
        } else {
          return Q.fcall(function () { return [name, content]; });
        }
      }).spread(function (name, orig, generated) {
        var to_generate = [
          [dst_static, generated || orig, !!generated],
          [dst_dyn, orig, false]
        ];
        return sequence(to_generate, function (order) {
          var act = order[2] ? "generate" : "copy";
          return logAndTime(act + " file " + src + " => " + order[0], function () {
            return Q.ninvoke(fs, 'writeFile', order[0], order[1], "utf8");
          }).then(function () {
            return order[0];
          });
        }, async).then(function (generated) { return [name, generated]; });
      });
    }).catch(function (err) {
      logger.error(err.stack || err);
      return [];
    });
  }

  function renderDir(src_dir, dst_static_dir, dst_dyn_dir, async) {
    return logAndTime("render dir " + src_dir, function () {
      return createDir([dst_static_dir, dst_dyn_dir], async)
        .then(function () {
          return Q.ninvoke(fs, 'readdir', src_dir);
        })
        .then(function (names) {
          return sequence(names, function (name) {
            var src = src_dir + "/" + name;
            var dst_static = dst_static_dir + "/" + name;
            var dst_dyn = dst_dyn_dir + "/" + name;
            return Q
              .ninvoke(fs, 'lstat', src)
              .then(function (stats) {
                if (stats.isFile()) {
                  return renderFile(name, src, dst_static, dst_dyn, async);
                } else if (stats.isDirectory()) {
                  return renderDir(src, dst_static, dst_dyn, async);
                } else {
                  var typ;
                  if (stats.isBlockDevice()) { typ = "BlockDevice"; }
                  if (stats.isCharacterDevice()) { typ = "CharacterDevice"; }
                  if (stats.isSymbolicLink()) { typ = "SymbolicLink"; }
                  if (stats.isFIFO()) { typ = "FIFO"; }
                  if (stats.isSocket()) { typ = "Socket"; }
                  logger.info("Ignore file " + src + " (" + typ + ")");
                  return null;
                }
              });
          }, async);
        });
    });
  }

  var async = true;
  var debug = false;
  _.each(process.argv.slice(2), function (arg) {
    switch (arg) {
      case '--async' : async = true; break;
      case '--no-async' : async = false; break;
      case '-d' :
      case '--debug' : debug = true; break;
      case '--no-debug' : debug = false; break;
    }
  });

  logger.info("async =", async);
  if (debug) {
    logger.info("debug =", debug);
    Q.longStackSupport = true;
  }

  createDir(["generated"])
    .then(function () {
      return renderDir("to_generate", "generated/static", "generated/dyn", async);
    })
    .done(function () { logger.info("cool cool cool"); });

}());
