var Q = require('q');
var _ = require('lodash');

var Router = require('./router');

(function (exporter, undefined) {

  function LocalRouter(localInfos, partials, router){
    this.localInfos = localInfos;
    this.partials = partials;
    this.router = router;
    this.urls = {};
  }

  LocalRouter.prototype.src = function() {
    return this.localInfos.src;
  };

  LocalRouter.prototype.dst = function() {
    return this.localInfos.dst;
  };

  LocalRouter.prototype.args = function() {
    return this.localInfos.args;
  };

  LocalRouter.prototype.localParams = function() {
    return this.router.params[this.src()];
  };

  LocalRouter.prototype.params = function() {
    return this.localParams().params;
  };

  LocalRouter.prototype.route = function() {
    return this.localParams().route;
  };

  LocalRouter.prototype.api= function() {
    return this.localParams().api;
  };

  LocalRouter.prototype.findFileFromSrc = function(file) {
    var res = Router.findFileFromHere(file, this.src());
    return res;
  };

  LocalRouter.prototype.findFileFromDst = function(file) {
    return Router.findFileFromHere(file, this.dst());
  };

  function createRouterPattern(route) {
    var rx = /\$(([a-z][a-z0-9]*)|\{([a-z][a-z0-9]*)\})/ig;
    var ptn = route.replace(rx, function (str, simple, complex) {
      var variable = simple || complex;
      return "([^/]+)";
    });
    return new RegExp("^" + ptn + "$");
  }

  function findRouteFromSrc(src, params) {
    var route;
    if (params.route) {
      route = params.route;
      if (!Router.isGlobal(route)) {
        route = src + '/' + route;
      }
    } else {
      route = [src.replace(/.html$/, '')].concat(_.map(params.params, function (param) {
        return '${' + param + '}';
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

  LocalRouter.prototype.findInfosFromHref = function(href) {
    var path = href;
    if (/\/$/.test(path)) { path += "index.html"; }
    return _
      .chain(this.router.params)
      .map(function (params, src) {
        var route = findRouteFromSrc(src, params);
        var ptn = createRouterPattern(route);
        var match = ptn.exec(path);
        if (match) {
          var args = {};
          for (var i=0; i<params.params.length; i++) {
            args[params.params[i]] = match[i+1];
          }
          return {src: src, args: args, dst: path, href: href};
        }
      })
      .compact()
      .value()[0];
  };

  LocalRouter.prototype.urlToDynCb = function() {
    var _this = this;
    return function (file, args) {
      var src = _this.findFileFromSrc(file);
      var url = _this.router.filename(src, args, _this.dst());
      if (!/\.html$/.test(src)) { src += ".html"; }
      url = _this.findFileFromDst(url);
      var infos = {src: src, args: args, dst: url};
      url = url.replace(/\/index\.html$/, '/');
      _this.urls[url] = infos;
      return url;
    };
  };

  LocalRouter.prototype.partial = function (partial) {
    return this.partials[partial];
  };


  LocalRouter.prototype.partialCb = function (content, templateEnv) {
    var loadPartial = this.partial.bind(this);
    return this.router.partialCb(content, templateEnv, loadPartial);
  };

  LocalRouter.prototype.copy = function(localInfos) {
    return new LocalRouter(localInfos, this.partials, this.router);
  };

  function create(router, partials) {
    return new LocalRouter({}, partials, router);
  }

  exporter.create = create;

}(typeof exports === 'object' && exports ? exports : (typeof module === "object" && module && typeof module.exports === "object" ? module.exports : window)));
