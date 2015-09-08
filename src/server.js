/* jshint newcap:false */

var fs = require("fs");
var util = require("util");

var Q = require("q");
var _ = require("lodash");
var moment = require("moment");

var baked = require("./baked");
var Router = require("./router");
var Configuration = require("./configuration");

(function (global, undefined) {
  "use strict";

  /* ***************************************************************** *** */
  /* ***                                                               *** */
  /* *** HELPERS                                                       *** */
  /* ***                                                               *** */
  /* ***************************************************************** *** */

  function sequence(arr, fn, ctx) {
    if (ctx.async) {
      return Q.all(_.map(arr, fn));
    } else {
      if (arr.length === 0) {
        return Q([]);
      } else {
        return Q.fcall(fn, arr[0]).then(function (result) {
          return sequence(arr.slice(1), fn, ctx).then(function (results) {
            if (result) {
              result = Array.isArray(result) ? result : [result];
              return result.concat(results);
            } else {
              return results;
            }
          });
        });
      }
    }
  }

  /* ***************************************************************** *** */
  /* ***                                                               *** */
  /* *** RENDERING CONTENT                                             *** */
  /* ***                                                               *** */
  /* ***************************************************************** *** */

  function createDir(dir) {
    return Q
      .ninvoke(fs, 'lstat', dir)
      .catch(
        function (err) {
          if (err && err.code == 'ENOENT') {
            return Q.ninvoke(fs, 'mkdir', dir)
              .catch(function (err) {
                if (err && err.code == 'EEXIST') return;
                throw err;
              });
          }
          throw err;
        }
      );
  }

  function createDirs(dirs, ctx) {
    return sequence(_.compact(dirs), createDir, ctx);
  }

  function createPath(dir) {
    var split = _.initial(dir.replace(/^\//, '').split("/"));
    var first = /^\//.test(dir) ? '' : false;
    function loop(toCreate, created) {
      if (_.isEmpty(toCreate)) {
        return Q(dir);
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

  function readFileSync(file) {
    return fs.readFileSync(file, 'utf8');
  }

  function generateFile(name, src, content, args, dst, router, ctx) {
    return logAndTime("render file '" + src + "' " + JSON.stringify(args), function () {
      var env = {};
      return baked.render(router, {
        mode: 'server',
        logger: ctx.logger,
        args: args,
        setContext: function (ctx) { env.ctx = ctx; },
        helpers: {
          pathTo: router.pathToStaticCb(src, dst),
          url_to: function (file, args) {
            if (!global.deprecationUrlTo) {
              ctx.logger.warn("url_to is deprecated, please use pathTo instead");
              global.deprecationUrlTo = true;
            }
            return router.pathToStaticCb(src, dst)(file, args);
          },
          urlTo: router.urlToStaticCb(src, dst),
          pathToHere: router.pathToHereStaticCb(src, dst, args),
          urlToHere: router.urlToHereStaticCb(src, dst, args),
          partial: router.partialCb(src, env, readFileSync),
          require: router.requireCb(src, env, readFileSync)
        },
        tmpl: content,
        api: router.api(src),
        requestHandler: ctx.requestHandler,
        ref: process.env.BAKED_REF,
        accessToken: process.env.BAKED_ACCESS_TOKEN
      }).then(function (result) {
        var routerInfos = router.routerInfosForFile(src, dst, args);
        var scriptTag = '<script>' +
          'window.routerInfosForFile = ' + JSON.stringify(routerInfos) + ';' +
        '</script>';
        return result.content.replace(/(<\/body>)/i, scriptTag + "\n$1");
      });
    }, ctx).then(function (result) {
      return logAndTime("generate file '" + src + "' => '" + dst + "'", function () {
        return createPath(dst, ctx).then(function () {
          return Q.ninvoke(fs, 'writeFile', dst, result, "utf8");
        });
      }, ctx);
    });
  }

  function copyFile(name, src, content, dst, ctx, encoding) {
    return logAndTime("copy file '" + src + "' => '" + dst + "'", function () {
      return Q.ninvoke(fs, 'writeFile', dst, content, encoding);
    }, ctx);
  }

  function isIgnored(src, ctx) {
    return _.any(ctx.ignore, function (ignore) {
      return ignore.test(src);
    });
  }

  function renderStaticFile(name, src, dst, args, router, ctx) {
    if (isIgnored(src, ctx)) {
      return Q(null);
    }
    return logAndTime("static render file '" + src + "' " + JSON.stringify(args), function () {
      if (!router.isBakedTemplate(src)) {
        return Q
          .ninvoke(fs, 'readFile', src)
          .then(function (content) {
            return copyFile(name, src, content, dst, ctx);
          });
      } else {
        return Q
          .ninvoke(fs, 'readFile', src, "utf8")
          .then(function (content) {
            if (!router.isDynamic(src)) {
              var file = src
                .replace(router.srcDir, '')
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
      }
    }, ctx).then(
      function () { return null; },  // only errors are returned
      function (err) {
        console.error(err.stack);
        return {src: src, dst: dst, args: args, error: err};
      }
    );
  }

  function saveTemplate(name, src, content, dst, ctx) {
    var tmpl_dst = dst + ".tmpl";
    return logAndTime("create template '" + src + "' => '" + tmpl_dst + "'", function () {
      return copyFile(name, src, content, tmpl_dst, ctx, "utf8");
    }, ctx);
  }

  function renderFile(name, src, args, dst, router, ctx) {
    var renders = [
      function () { return renderStaticFile(name, src, dst, args, router, ctx); }
    ];
    return sequence(renders, function (f) { return f(); }, ctx);
  }

  function renderDir(srcDir, dstDir, router, ctx) {
    if (isIgnored(srcDir, ctx)) {
      return Q([]);
    }
    return logAndTime("render dir '" + srcDir + "'", function () {
      return createDirs([dstDir], ctx)
        .then(function () {
          return Q.ninvoke(fs, 'readdir', srcDir);
        })
        .then(function (names) {
          return sequence(names, function (name) {
            var src = srcDir + "/" + name;
            var dst = dstDir + "/" + name;
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
    }, ctx)
    .then(_.flatten.bind(_));
  }

  function renderDynamicCall(call, dstDir, router, ctx) {
    var src = router.srcForCall(call);
    var dst = router.globalFilenameForCall(call);
    return createPath(dst, ctx).then(function () {
      return renderStaticFile(call.file, src, dst, call.args, router, ctx);
    });
  }

  function renderStackedCalls(router, dstDir, ctx) {
    var lastCalls = router.lastCalls();
    if (_.isEmpty(lastCalls)) {
      return Q();
    } else {
      return sequence(lastCalls, function (call) {
        router.generated(call);
        return renderDynamicCall(call, dstDir, router, ctx);
      }, ctx).then(function () {
        return renderStackedCalls(router, dstDir, ctx);
      } );
    }
  }

  /* ***************************************************************** *** */
  /* ***                                                               *** */
  /* *** BUILDING ROUTER                                               *** */
  /* ***                                                               *** */
  /* ***************************************************************** *** */

  function buildRouterForFile(name, src, ctx) {
    if (isIgnored(src, ctx)) {
      return Q();
    }
    return logAndTime("Build router for file '" + src + "'", function () {
      var result;
      if (Router.isPartial(name)) {
        result = {};
        result[src] = {partial: true};
        return result;
      } else if (Router.isJSScript(name)) {
        result = {};
        result[src] = {require: true};
        return result;
      } else if (Router.isTemplate(name)) {
        return Q
          .ninvoke(fs, 'readFile', src, "utf8")
          .then(function (content) {
            var result = {};
            var infos = baked.parseRoutingInfos(content, ctx);
            if (infos) {
              result[src] = infos;
              return result;
            } else {
              return null;
            }
          });
      } else {
        return Q();
      }
    }, ctx);
  }

  function buildRouterForDir(srcDir, ctx) {
    if (isIgnored(srcDir, ctx)) {
      return Q([]);
    }
    return logAndTime("Build router for dir '" + srcDir + "'", function () {
      return Q
        .ninvoke(fs, 'readdir', srcDir)
        .then(function (names) {
          return sequence(names, function (name) {
            var src = srcDir + "/" + name;
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

  function buildRouter(srcDir, dstDir, ctx) {
    return buildRouterForDir(srcDir, ctx).then(function (params) {
      return Router.create(params, {
        srcDir: srcDir,
        dstDir: dstDir,
        logger: ctx.logger
      });
    });
  }

  /* ***************************************************************** *** */
  /* ***                                                               *** */
  /* *** SAVING ROUTER                                                 *** */
  /* ***                                                               *** */
  /* ***************************************************************** *** */

  function saveRouter(router, dir, ctx) {
    var dst = dir + '/_router.json';
    return logAndTime("Save router => '" + dst + "'", function () {
      var content = JSON.stringify(router.routerInfos(ctx));
      return Q.ninvoke(fs, 'writeFile', dst, content, "utf8");
    }, ctx).thenResolve(router);
  }

  /* ***************************************************************** *** */
  /* ***                                                               *** */
  /* *** READING CONFIGURATION FILE                                    *** */
  /* ***                                                               *** */
  /* ***************************************************************** *** */

  /* ***************************************************************** *** */
  /* ***                                                               *** */
  /* *** MAIN FUNCTION                                                 *** */
  /* ***                                                               *** */
  /* ***************************************************************** *** */

  function run(ctx) {
    return Q.fcall(function () {
      ctx.logger.debug("ctx:", ctx);
      if (ctx.debug) Q.longStackSupport = true;
      return logAndTime("Generation", function () {
        return createPaths([ctx.dstDir], ctx)
          .then(function () {
            return buildRouter(ctx.srcDir, ctx.dstDir, ctx);
          })
          .then(function (router) {
            return renderDir(ctx.srcDir, ctx.dstDir, router, ctx)
              .then(function (fromFiles) {
                return renderStackedCalls(router, ctx.dstDir, ctx)
                  .then(function (fromCalls) {
                    return _.compact(fromFiles.concat(fromCalls));
                  });
              })
              .then(function (res) {
                return saveRouter(router, ctx.dstDir, ctx)
                  .thenResolve(res);
              });
          });
      }, ctx);
    });
  }

  exports.generate = run;

}(global));

if (require.main === module) {
  console.error("Runner has been changed: use `gulp` or `gulp --src <src> --dst <dst>`");
}
