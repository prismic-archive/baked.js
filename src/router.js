var Q = require("q");
var _ = require("lodash");

var dorian = require("./dorian");

(function (Global, undefined) {
  "use strict";

  function log(logger) {
    var args = _.rest(arguments, 1);
    if (logger) { logger.info.apply(logger, args); }
  }

  function els(path, dir) {
    if (dir) {
      path = [''].concat(_.compact(path.split('/'))).join('/').replace(/\/[^\/]*$/, '');
    }
    return _.compact(path.split('/'));
  }

  function isGlobal(path) {
    return /^\//.test(path);
  }

  function Router(params, opts) {
    this.params = params;
    this.src_dir = opts.src_dir;
    this.dst_dir = opts.dst_dir;
    this.calls = {};
    this.logger = opts.logger;
  }

  Router.prototype.isTemplate = function (file) {
    return !!this.params[file];
  };

  Router.prototype.isDynamic = function (file) {
    return this.isTemplate(file) && !_.isEmpty(this.params[file].params);
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

  function srcForFile(router, file) {
    return router.src_dir + "/" + file + ".html";
  }

  Router.prototype.srcForCall = function (call) {
    return srcForFile(this, call.file);
  };

  function getParamsFromFile(router, file) {
    return router.params[srcForFile(router, file)];
  }

  Router.prototype.urlToDyn = function (file, args) {
    if (_.isString(args)) { args = {id: args}; }
    var queryString = _.map(args, function (value, name) {
      return name + "=" + value;
    }).join("&");
    return file + ".html" + (_.isEmpty(queryString) ? '' : '?' + queryString);
  };

  Router.prototype.urlToDynCb = function () {
    var _this = this;
    return function () {
      return _this.urlToDyn.apply(_this, arguments);
    };
  };

  function findFileFromHere(file, here) {
    var fileEls = els(file);
    var hereEls = els(here, true);
    while (_.first(fileEls) == '..') {
      fileEls.shift();
      hereEls.pop();
    }
    return hereEls.concat(fileEls).join('/');
  }

  Router.prototype.urlToStatic = function (file, args, here_src, here_dst) {
    var parsedArgs = args;
    if (here_src) { here_src = here_src.replace(this.src_dir, ''); }
    if (here_dst) { here_dst = here_dst.replace(this.dst_dir, ''); }
    var fileFromHere = findFileFromHere(file, here_src);
    if (_.isString(parsedArgs)) { parsedArgs = {id: parsedArgs}; }
    var params = getParamsFromFile(this, fileFromHere);
    if (!params) {
      throw "Bad arguments (file '" + file + "' not found)";
    } else if (_.all(params.params, function (param) { return parsedArgs && !!parsedArgs[param]; })) {
      addCall(this, fileFromHere, parsedArgs);
      return this.filename(fileFromHere, parsedArgs, here_dst);
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

  Router.prototype.filename = function (file, args, here) {
    var params = getParamsFromFile(this, file);
    var path;
    if (params.route) {
      path = dorian.renderRoute(params.route, args);
      if (!isGlobal(path)) {
        var dir = els(file, true);
        path = dir.concat(els(path)).join('/');
      }
    } else {
      path = [file].concat(_.map(params.params, function (param) {
        return args[param];
      })).join("/") + ".html";
    }
    var diff = pathDiff(
      els(here || '', true),
      els(path)
    );
    return diff.join('/');
  };

  Router.prototype.globalFilename = function (file, args, here) {
    return [this.dst_dir].concat(this.filename(file, args, here)).join('/');
  };

  Router.prototype.filenameForCall = function (call) {
    return this.filename(call.file, call.args);
  };

  Router.prototype.globalFilenameForCall = function (call) {
    return this.globalFilename(call.file, call.args);
  };

  function create(params, src_dir, logger) {
    return new Router(params, src_dir, logger);
  }

  Global.create = create;

}(typeof exports === 'object' && exports ? exports : (typeof module === "object" && module && typeof module.exports === "object" ? module.exports : window)));
