var Prismic = require("prismic.io").Prismic;
var Q = require("q");
var _ = require("lodash");

var baked = require("./baked");
var Router = require("./router");

(function(window, undefined) {
  "use strict";

  var logger = window.console;
  var router = Router.create({}, {logger: logger});

  function prepareConf() {
    var routerInfos = baked.parseRoutingInfos(window.document.head.innerHTML);
    var conf = baked.initConf(window, window, {
      logger: logger,
      helpers: {
        url_to: router.urlToDynCb()
      },
      args: getArgs(routerInfos)
    });
    return conf;
  }

  function getArgs(routerInfos) {
    function getParameterByName(name) {
      name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
      var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
      var results = regex.exec(location.search);
      return (!results) ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    }
    return _.reduce(routerInfos.params, function (args, param) {
      args[param] = getParameterByName(param);
      return args;
    }, {});
  }

  function notifyRendered(window, conf, maybeRef) {
    var document = window.document;

    var e = document.createEvent("HTMLEvents");
    e.initEvent("prismic:rendered", true, true);
    e.ref = maybeRef;
    document.dispatchEvent(e);
  }

  var HTML = document.querySelectorAll('html')[0];
  HTML.style.display = 'none';
  document.addEventListener('DOMContentLoaded', function() {

    var conf = window.prismicSinglePage;
    if (!conf) { window.prismicSinglePage = conf = prepareConf(); }
    baked.render(window, router, {conf: conf, notifyRendered: notifyRendered}, window)
      .fin(function() { HTML.style.display = ''; })
      .done(undefined, function (err) {
        logger.error(err.message);
      });

  });

})(window);

