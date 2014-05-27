var fs = require("fs");
var util = require("util");

var Q = require("q");
var _ = require("lodash");
var moment = require("moment");
var winston = require('winston');

var baked = require("./baked");
var Router = require("./router");

(function (global, undefined) {
  "use strict";

  function buildLogger() {
    return new (winston.Logger)({
      transports: [
        new (winston.transports.Console)({
          json: false,
          timestamp: true,
          level: 'debug',
          colorize: true
        })
      ]
    });
  }

  function sequence(arr, fn, ctx) {
    if (ctx.async) {
      return Q.all(_.map(arr, fn));
    } else {
      if (arr.length === 0) {
        return Q.fcall(function () { return []; });
      } else {
        return Q.fcall(fn, arr[0]).then(function (result) {
          return sequence(arr.slice(1), fn, ctx).then(function (results) {
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
            deferred.resolve(window);
          }
        }
      );
    }
    return deferred.promise;
  }

  function createDir(dir) {
    return Q
      .ninvoke(fs, 'mkdir', dir).catch(function (err) {
        if (!err || err.code != 'EEXIST') { throw err; }
      });
  }

  function createDirs(dirs, ctx) {
    return sequence(_.compact(dirs), createDir, ctx);
  }

  function createPath(dir) {
    var split = _.initial(dir.replace(/^\//, '').split("/"));
    var first = /^\//.test(dir) ? '' : false;
    function loop(toCreate, created) {
      if (_.isEmpty(toCreate)) {
        return Q.fcall(function () { return dir; });
      } else {
        dir = (created !== false ? created + "/" : '') + toCreate[0];
        var rest = _.rest(toCreate);
        return createDir(dir).then(function () { return loop(rest, dir); });
      }
    }
    return loop(split, first);
  }

  function createPaths(dirs, ctx) {
    return sequence(_.compact(dirs), createPath, ctx);
  }

  function logAndTime(name, fn, ctx) {
    var start = moment();
    function diff() { return moment().diff(start); }
    ctx.logger.info(name + " ...");
    return Q
      .fcall(fn)
      .then(
        function (res) {
          ctx.logger.info(name + " ... OK [" + diff() +"ms]");
          return res;
        },
        function (err) {
          ctx.logger.error(name + " ... ERROR [" + diff() +"ms]");
          throw err;
        }
      );
  }

  function generateFile(name, src, content, args, dst, router, ctx) {
    return withWindow(content).then(function (window) {
      return logAndTime("render file '" + src + "' " + JSON.stringify(args), function () {
        return baked.render(window, router, {
          logger: ctx.logger,
          args: args,
          helpers: {url_to: router.urlToStaticCb(src, dst)}
        }, global).then(function () {
          var script = window.document.createElement("script");
          var routerInfos = router.routerInfosForFile(src, dst, args);
          script.innerHTML = 'window.routerInfosForFile = ' + JSON.stringify(routerInfos) + ';';
          window.document.body.appendChild(script);
        });
      }, ctx).then(function () {
        return logAndTime("generate file '" + src + "' => '" + dst + "'", function () {
          return Q.ninvoke(fs, 'writeFile', dst, window.document.innerHTML, "utf8");
        }, ctx).then(function () {
          return dst;
        });
      });
    });
  }

  function copyFile(name, src, content, dst, ctx) {
    return logAndTime("copy file '" + src + "' => '" + dst + "'", function () {
      return Q.ninvoke(fs, 'writeFile', dst, content, "utf8");
    }, ctx).thenResolve(dst);
  }

  function renderStaticFile(name, src, dst, args, router, ctx) {
    return logAndTime("static render file '" + src + "' " + JSON.stringify(args), function () {
      return Q
        .ninvoke(fs, 'readFile', src, "utf8")
        .then(function (content) {
          if (!router.isTemplate(src)) {
            return copyFile(name, src, content, dst, ctx);
          } else if (!router.isDynamic(src)) {
            var file = src
              .replace(router.src_dir, '')
              .replace(/\.html$/, '');
            var customDst = router.globalFilename(file, args);
            return saveTemplate(name, src, content, dst, ctx).then(function () {
              return generateFile(name, src, content, args, customDst, router, ctx);
            });
          } else if (args) {
            return generateFile(name, src, content, args, dst, router, ctx);
          } else {
            return saveTemplate(name, src, content, dst, ctx);
          }
        });
    }, ctx).catch(function (err) {
      ctx.logger.error(err.stack || err);
      return [];
    });
  }

  function saveTemplate(name, src, content, dst, ctx) {
    var tmpl_dst = dst + ".tmpl";
    return logAndTime("create template '" + src + "' => '" + tmpl_dst + "'", function () {
      return withWindow(content)
        .then(function (window) {
          return copyFile(name, src, window.document.body.innerHTML, tmpl_dst, ctx);
        });
    }, ctx);
  }

  function renderFile(name, src, args, dst, router, ctx) {
    var renders = [
      function () { return renderStaticFile(name, src, dst, args, router, ctx); }
    ];
    return sequence(renders, function (f) { return f(); }, ctx);
  }

  function renderDir(src_dir, dst_dir, router, ctx) {
    return logAndTime("render dir '" + src_dir + "'", function () {
      return createDirs([dst_dir], ctx)
        .then(function () {
          return Q.ninvoke(fs, 'readdir', src_dir);
        })
        .then(function (names) {
          return sequence(names, function (name) {
            var src = src_dir + "/" + name;
            var dst = dst_dir + "/" + name;
            return Q
              .ninvoke(fs, 'lstat', src)
              .then(function (stats) {
                if (stats.isFile()) {
                  return renderFile(name, src, null, dst, router, ctx);
                } else if (stats.isDirectory()) {
                  return renderDir(src, dst, router, ctx);
                } else {
                  var typ;
                  if (stats.isBlockDevice()) { typ = "BlockDevice"; }
                  if (stats.isCharacterDevice()) { typ = "CharacterDevice"; }
                  if (stats.isSymbolicLink()) { typ = "SymbolicLink"; }
                  if (stats.isFIFO()) { typ = "FIFO"; }
                  if (stats.isSocket()) { typ = "Socket"; }
                  ctx.logger.info("Ignore file " + src + " (" + typ + ")");
                  return null;
                }
              });
          }, ctx);
        });
    }, ctx);
  }

  function renderDynamicCall(call, dst_dir, router, ctx) {
    var src = router.srcForCall(call);
    var dst = router.globalFilenameForCall(call);
    return createPath(dst, ctx).then(function () {
      return renderStaticFile(call.file, src, dst, call.args, router, ctx);
    });
  }

  function renderStackedCalls(router, dst_dir, ctx) {
    var lastCalls = router.lastCalls();
    if (_.isEmpty(lastCalls)) {
      return Q.fcall(function () { return; });
    } else {
      return sequence(lastCalls, function (call) {
        router.generated(call);
        return renderDynamicCall(call, dst_dir, router, ctx);
      }, ctx).then(function () {
        return renderStackedCalls(router, dst_dir, ctx);
      } );
    }
  }

  function buildRouterForFile(name, src, ctx) {
    return logAndTime("Build router for file '" + src + "'", function () {
      if (/\.html$/.test(name)) {
        return Q
          .ninvoke(fs, 'readFile', src, "utf8")
          .then(function (content) {
            var result = {};
            result[src] = baked.parseRoutingInfos(content);
            return result;
          });
      } else {
        return Q.fcall(function () { return null; });
      }
    }, ctx);
  }

  function buildRouterForDir(src_dir, ctx) {
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
                  return buildRouterForFile(name, src, ctx);
                } else if (stats.isDirectory()) {
                  return buildRouterForDir(src, ctx);
                } else {
                  return [];
                }
              });
          }, ctx);
        }).then(function (arrs) {
          return _.chain(arrs).flatten().compact().reduce(function (res, obj) {
            return _.extend(res, obj);
          }, {}).value();
        });
    }, ctx);
  }

  function buildRouter(src_dir, dst_dir, ctx) {
    return buildRouterForDir(src_dir, ctx).then(function (params) {
      return Router.create(params, {
        src_dir: src_dir,
        dst_dir: dst_dir,
        logger: ctx.logger
      });
    });
  }

  function saveRouter(router, dir, ctx) {
    var dst = dir + '/_router.json';
    return logAndTime("Save router => '" + dst + "'", function () {
      var content = JSON.stringify(router.routerInfos());
      return Q.ninvoke(fs, 'writeFile', dst, content, "utf8");
    }, ctx).then(function () {
      return router;
    });
  }

  function run(opts) {
    return Q.fcall(function () {
      var ctx = _.assign({logger: buildLogger()}, opts, {
        src_dir: opts.src_dir,
        dst_dir: opts.dst_dir
      });
      ctx.logger.info("ctx:", _.assign({}, ctx, {logger: '<LOGGER>'}));
      if (ctx.debug) Q.longStackSupport = true;
      return logAndTime("Generation", function () {
        return createPaths([opts.dst_dir], ctx)
          .then(function () {
            return buildRouter(opts.src_dir, opts.dst_dir, ctx);
          })
          .then(function (router) {
            return renderDir(opts.src_dir, opts.dst_dir, router, ctx)
              .then(function () { return router; });
          })
          .then(function (router) {
            return renderStackedCalls(router, opts.dst_dir, ctx)
              .thenResolve(router);
          })
          .then(function (router) {
            return saveRouter(router, opts.dst_dir, ctx);
          });
      }, ctx);
    });
  }

  exports.generate = run;

}(global));

if (require.main === module) {
  console.error("Runner has been changed: use `gulp` or `node generate.js <src> <dst>`");
}
