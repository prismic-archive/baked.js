var fs = require("fs");

var Q = require("q");
var _ = require("lodash");
var moment = require("moment");
var winston = require('winston');

var dorian = require("./dorian");
var Router = require("./router");

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

  function createPath(dir, async) {
    var split = _.initial(dir.split("/"));
    function loop(toCreate, created) {
      if (_.isEmpty(toCreate)) {
        return Q.fcall(function () { return dir; });
      } else {
        var dir = (created ? created + "/" : '') + toCreate[0];
        var rest = _.rest(toCreate);
        return Q
          .ninvoke(fs, 'mkdir', dir).catch(function (err) {
            if (!err || err.code != 'EEXIST') { throw err; }
          })
          .then(function () {
            return loop(rest, dir);
          });
      }
    }
    return loop(split);
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
          logger.error(name + " ... ERROR [" + diff() +"ms]");
          throw err;
        }
      );
  }

  function generateFile(name, src, content, args, dst, router, async) {
    return withWindow(content).then(function (window) {
      return logAndTime("render file '" + src + "' " + JSON.stringify(args), function () {
        return dorian.render(window, router, {
          logger: logger,
          args: args,
          helpers: {url_to: router.urlToStaticCb()}
        });
      }).then(function () {
        return logAndTime("generate file '" + src + "' => '" + dst + "'", function () {
          return Q.ninvoke(fs, 'writeFile', dst, window.document.innerHTML, "utf8");
        }).then(function () {
          return dst;
        });
      });
    });
  }

  function copyFile(name, src, content, dst, router, async) {
    return logAndTime("copy file '" + src + "' => '" + dst + "'", function () {
      return Q.ninvoke(fs, 'writeFile', dst, content, "utf8");
    }).then(function () {
      return dst;
    });
  }

  function renderStaticFile(name, src, dst, args, router, async) {
    return logAndTime("static render file '" + src + "' " + JSON.stringify(args), function () {
      return Q
        .ninvoke(fs, 'readFile', src, "utf8")
        .then(function (content) {
          if (!router.isTemplate(src)) {
            return copyFile(name, src, content, dst, router, async);
          } else if (!router.isDynamic(src)) {
            return generateFile(name, src, content, args, dst, router, async);
          } else if (args) {
            return generateFile(name, src, content, args, dst, router, async);
          } else {
            return Q.fcall(function () { return; });
          }
        });
    }).catch(function (err) {
      logger.error(err.stack || err);
      return [];
    });
  }

  function renderDynamicFile(name, src, dst, router, async) {
    return logAndTime("dynamic render file '" + src + "'", function () {
      return Q
        .ninvoke(fs, 'readFile', src, "utf8")
        .then(function (content) {
          return copyFile(name, src, content, dst, router, async);
        });
    }).catch(function (err) {
      logger.error(err.stack || err);
      return [];
    });
  }

  function renderFile(name, src, args, dst_static, dst_dyn, router, async) {
    return sequence([
      function () { return renderStaticFile(name, src, dst_static, args, router, async); },
      function () { return renderDynamicFile(name, src, dst_dyn, router, async); }
    ], function (f) { return f(); }, async);
  }

  function renderDir(src_dir, dst_static_dir, dst_dyn_dir, router, async) {
    return logAndTime("render dir '" + src_dir + "'", function () {
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
                  return renderFile(name, src, null, dst_static, dst_dyn, router, async);
                } else if (stats.isDirectory()) {
                  return renderDir(src, dst_static, dst_dyn, router, async);
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

  function renderDynamicCall(call, dst_dir, router, async) {
    var src = router.srcForCall(call);
    var filename = router.filenameForCall(call);
    var dst = dst_dir + "/" + filename;
    return createPath(dst, async).then(function () {
      return renderStaticFile(call.file, src, dst, call.args, router, async);
    });
  }

  function renderStackedCalls(router, dst_dir, async) {
    var lastCalls = router.lastCalls();
    if (_.isEmpty(lastCalls)) {
      return Q.fcall(function () { return; });
    } else {
      return sequence(lastCalls, function (call) {
        router.generated(call);
        return renderDynamicCall(call, dst_dir, router, async);
      }, async).then(function () {
        return renderStackedCalls(router, dst_dir, async);
      } );
    }
  }

  function buildRouterForFile(name, src) {
    return logAndTime("Build router for file '" + src + "'", function () {
      if (/\.html$/.test(name)) {
        return Q
          .ninvoke(fs, 'readFile', src, "utf8")
          .then(function (content) {
            var result = {};
            result[src] = dorian.parseRoutingInfos(content);
            return result;
          });
      } else {
        return Q.fcall(function () { return null; });
      }
    });
  }

  function buildRouterForDir(src_dir, async) {
    return logAndTime("Build router for dir '" + src_dir + "'", function () {
      return Q
        .ninvoke(fs, 'readdir', src_dir)
        .then(function (names) {
          return sequence(names, function (name) {
            var src = src_dir + "/" + name;
            return Q
              .ninvoke(fs, 'lstat', src)
              .then(function (stats) {
                if (stats.isFile()) {
                  return buildRouterForFile(name, src, async);
                } else if (stats.isDirectory()) {
                  return buildRouterForDir(src, async);
                } else {
                  return [];
                }
              });
          }, async);
        }).then(function (arrs) {
          return _.chain(arrs).flatten().compact().reduce(function (res, obj) {
            return _.extend(res, obj);
          }, {}).value();
        });
    });
  }

  function buildRouter(dir) {
    return buildRouterForDir(dir).then(function (params) {
      return Router.create(params, {
        src_dir: src_dir,
        logger: logger
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

  return logAndTime("Generation", function () {
    return createDir(["generated"])
      .then(function () {
        return buildRouter("to_generate");
      })
      .then(function (router) {
        return renderDir("to_generate", "generated/static", "generated/dyn", router, async)
          .then(function () { return router; });
      })
      .then(function (router) {
        return renderStackedCalls(router, "generated/static", async);
      });
  }).done(
    function () { logger.info("cool cool cool"); },
    function (err) { logger.error(err.stack); }
  );

}());
