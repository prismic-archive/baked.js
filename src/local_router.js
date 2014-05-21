var Q = require('q');
var _ = require('lodash');

var Router = require('./router');

(function (exporter, undefined) {

  function LocalRouter(localInfos, router){
    this.localInfos = localInfos;
    this.router = router;
  }

  LocalRouter.prototype.localParams = function() {
    return this.router.params[this.localInfos.src];
  };

  LocalRouter.prototype.params = function() {
    return this.localParams().params;
  };

  LocalRouter.prototype.route = function() {
    return this.localParams().route;
  };

  LocalRouter.prototype.getFileFromHere = function(file) {
    return Router.findFileFromHere(file, this.localInfos.src);
  };

  function create(localInfos, router) {
    return new LocalRouter(localInfos, router);
  }

  exporter.create = create;

}(typeof exports === 'object' && exports ? exports : (typeof module === "object" && module && typeof module.exports === "object" ? module.exports : window)));
