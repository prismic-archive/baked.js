var Q = require("q");
var _ = require("lodash");

var baked = require("./baked");

(function (Global, undefined) {
  "use strict";

  function els(path, dir) {
    if (dir) {
      path = [''].concat(_.compact(path.split('/'))).join('/').replace(/\/[^\/]*$/, '');
    }
    return _.compact(path.split('/'));
  }

  function isGlobal(path) {
    return /^\//.test(path);
  }

  function Router(params, partials, opts) {
    this.params = params;
    this.partials = partials;
    this.src_dir = opts.src_dir;
    this.dst_dir = opts.dst_dir;
    this.calls = {};
    this.generatedRoutes = {};
  }

  Router.prototype.api = function(src) {
    var params = this.params[src];
    return params && params.api;
  };

  function isTemplate(file) {
    return /\.html$/.test(_.last(els(file)));
  }

  function srcForFile(router, file) {
    return router.src_dir + file + ".html";
  }

  function isPartial(file) {
    return isTemplate(file) && /^_/.test(_.last(els(file)));
  }

  Router.prototype.cleanFilename = function(src) {
    return src
      .replace(this.src_dir, '')
      .replace(/\.html$/, '');
  };

  Router.prototype.isBakedTemplate = function (file) {
    return !!this.params[file];
  };

  Router.prototype.isDynamic = function (file) {
    return isTemplate(file) && !_.isEmpty(this.params[file].params);
  };

  Router.prototype.dynamicTemplates = function () {
    return _.omit(this.params, function (params) {
      return _.isEmpty(params.params);
    });
  };

  function findOrCreateCalls(router, file) {
    var calls = router.calls[file];
    if (!calls) { router.calls[file] = calls = []; }
    return calls;
  }

  function findOrCreateCall(router, file, args) {
    var calls = findOrCreateCalls(router, file);
    var call = _.find(calls, function (c) {
      return _.isEqual(args, c.args);
    });
    if (!call) {
      call = {
        args: args,
        generated: !router.isDynamic(srcForFile(router, file))
      };
      calls.push(call);
    }
    return call;
  }

  function addCall(router, file, args) {
    return findOrCreateCall(router, file, args);
  }

  Router.prototype.lastCalls = function () {
    return _.chain(this.calls)
      .map(function (calls, file) {
        return _.map(calls, function (call) {
          if (!call.generated) {
            return {file: file, args: call.args};
          }
        });
      })
      .flatten()
      .compact()
      .value();
  };

  Router.prototype.generated = function (call) {
    var existing = findOrCreateCall(this, call.file, call.args);
    existing.generated = true;
  };

  Router.prototype.srcForCall = function (call) {
    return srcForFile(this, call.file);
  };

  function getParamsFromFile(router, file) {
    return router.params[srcForFile(router, file)];
  }

  function findFileFromHere(file, here) {
    var fileEls = els(file);
    var hereEls = els(here, true);
    if (/^\//.test(file)) {
      hereEls = [];
    }
    _.each(fileEls, function (dir) {
      if (dir == '..') {
        hereEls.pop();
      } else {
        hereEls.push(dir);
      }
    });
    return '/' + hereEls.join('/');
  }

  function addGeneratedRoute(router, relativePath, call, here, file, here_src) {
    var globalPath = findFileFromHere(relativePath, here);
    var infos = {
      args: call.args,
      by: router.cleanFilename(here_src),
      to: file,
    };
    if (router.generatedRoutes[globalPath]) {
      var existing = router.generatedRoutes[globalPath];
      if (!_.isEqual(existing.to, infos.to) || !_.isEqual(existing.args, infos.args)) {
        throw "The URL " + globalPath +
              " (by: " + infos.by + " to:" + infos.to + " args:" + JSON.stringify(infos.args) + ")" +
              " has been already generated" +
              " (by: " + existing.by + " to:" + existing.to + " args:" + JSON.stringify(existing.args) + ")";
      }
    } else {
      router.generatedRoutes[globalPath] = infos;
    }
  }

  Router.prototype.urlToStatic = function (file, args, here_src, here_dst) {
    var parsedArgs = args || {};
    if (here_src) { here_src = here_src.replace(this.src_dir, ''); }
    if (here_dst) { here_dst = here_dst.replace(this.dst_dir, ''); }
    var fileFromHere = findFileFromHere(file, here_src);
    if (_.isString(parsedArgs)) { parsedArgs = {id: parsedArgs}; }
    var params = getParamsFromFile(this, fileFromHere);
    if (!params) {
      throw "Bad arguments (file '" + file + "' not found)";
    } else if (_.all(params.params, function (param) { return parsedArgs && !!parsedArgs[param]; })) {
      var call = addCall(this, fileFromHere, parsedArgs);
      var filename = this.filename(fileFromHere, parsedArgs, here_dst);
      filename = findFileFromHere(filename, here_dst);
      addGeneratedRoute(this, filename, call, here_dst, fileFromHere, here_src);
      return filename.replace(/\/index\.html$/, '/');
    } else {
      throw "Bad arguments (bad arguments " + JSON.stringify(args) + " for file '" + file + "')";
    }
  };

  Router.prototype.urlToStaticCb = function (here_src, here_dst) {
    var _this = this;
    return function (file, args) {
      return _this.urlToStatic(file, args, here_src, here_dst);
    };
  };

  function pathDiff(from, to) {
    var diff = [];
    while (_.first(from) == _.first(to)) {
      from = _.rest(from);
      to = _.rest(to);
    }
    diff = diff.concat(_.map(from, function (e) {
      return "..";
    }));
    return diff.concat(to);
  }

  function buildRouteForFile(file, params, args) {
    var route;
    if (params.route) {
      route = baked.renderRoute(params.route, args);
      if (!isGlobal(route)) {
        var dir = els(file, true);
        route = '/' + dir.concat(els(route)).join('/');
      }
    } else {
      route = [file].concat(_.map(params.params, function (param) {
        return args[param];
      })).join('/');
    }
    if (/\/index\.html?$/.test(route)) {
      // nothing to do
    } else if (/\/index?$/.test(route)) {
      route += ".html";
    } else if (!/\.html$/.test(route)) {
      route += "/index.html";
    }
    return route;
  }

  Router.prototype.filename = function (file, args, here) {
    var params = getParamsFromFile(this, file);
    var path = buildRouteForFile(file, params, args);
    var diff = pathDiff(
      els(here || '', true),
      els(path)
    );
    return diff.join('/');
  };

  Router.prototype.globalFilename = function (file, args, here) {
    return this.dst_dir + '/' + this.filename(file, args, here);
  };

  Router.prototype.filenameForCall = function (call) {
    return this.filename(call.file, call.args);
  };

  Router.prototype.globalFilenameForCall = function (call) {
    return this.globalFilename(call.file, call.args);
  };

  Router.prototype.routerInfosForFile = function (src, dst, args) {
    return {
      src: src.replace(this.src_dir, ''),
      dst: dst.replace(this.dst_dir, ''),
      args: args
    };
  };

  Router.prototype.routerInfos = function () {
    return {
      params: _.transform(this.params, function (result, value, name) {
        result[name.replace(this.src_dir, '')] = value;
      }, null, this),
      partials: _.map(this.partials, function (name) {
        return name.replace(this.src_dir, '');
      }, this)
    };
  };

  function getPartialPath(router, name, here) {
    var path = findFileFromHere(name, here.replace(router.src_dir, ''));
    var pathEls = els(path);
    if (_.isEmpty(pathEls)) return null;
    var file = pathEls[pathEls.length - 1];
    if (!/^_/.test(file)) { file = '_' + file; }
    if (!/\.html$/.test(file)) { file += '.html'; }
    pathEls[pathEls.length - 1] = file;
    return router.src_dir + (/^\//.test(path) ? '/' : '') + pathEls.join('/');
  }

  Router.prototype.partialCb = function(src, templateEnv, global, getPartial) {
    var _this = this;
    return function (name) {
      var partial = getPartialPath(_this, name, src);
      var content = getPartial(partial);
      return baked.renderTemplate(content, templateEnv.env, global);
    };
  };

  function create(params, partials, src_dir) {
    if (!src_dir) {
      src_dir = partials;
      partials = _.keys(_.pick(params, function (v) { return v.partial; }));
      params = _.pick(params, function (v) { return !v.partial; });
    }
    return new Router(params, partials, src_dir);
  }

  Global.create = create;
  Global.findFileFromHere = findFileFromHere;
  Global.buildRouteForFile = buildRouteForFile;
  Global.isGlobal = isGlobal;
  Global.isTemplate = isTemplate;
  Global.isPartial = isPartial;

}(typeof exports === 'object' && exports ? exports : (typeof module === "object" && module && typeof module.exports === "object" ? module.exports : window)));
