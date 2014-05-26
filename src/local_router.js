var Q = require('q');
var _ = require('lodash');

var Router = require('./router');

(function (exporter, undefined) {

  function LocalRouter(localInfos, router){
    this.localInfos = localInfos;
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

  LocalRouter.prototype.findFileFromSrc = function(file) {
    var res = Router.findFileFromHere(file, this.src());
    return res;
  };

  LocalRouter.prototype.findFileFromDst = function(file) {
    return Router.findFileFromHere(file, this.dst());
  };

  function globalFile(localRouter, file) {
    var here = localRouter.src();

  }

  LocalRouter.prototype.urlToDynCb = function() {
    var _this = this;
    return function (file, args) {
      var src = _this.findFileFromSrc(file);
      var url = _this.router.filename(src, args, _this.dst());
      if (!/\.html$/.test(src)) { src += ".html"; }
      url = _this.findFileFromDst(url);
      var infos = {src: src, args: args, dst: url};
      _this.urls[url] = infos;
      return url;
    };
  };

  LocalRouter.prototype.copy = function(localInfos) {
    return create(localInfos, this.router);
  };

  function create(localInfos, router) {
    return new LocalRouter(localInfos, router);
  }

  exporter.create = create;

}(typeof exports === 'object' && exports ? exports : (typeof module === "object" && module && typeof module.exports === "object" ? module.exports : window)));
