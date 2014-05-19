var Prismic = require("prismic.io").Prismic;
var Q = require("q");
var _ = require("lodash");

var baked = require("./baked");
var Router = require("./router");
var LocalRouter = require("./local_router");

(function(window, undefined) {
  "use strict";

  var logger = window.console;

  function prepareConf(localRouter) {
    var queryArgs = getArgs(baked.parseRoutingInfos(window.document.head.innerHTML));
    var localArgs = localRouter.localInfos.args;
    var args = _.assign({}, localArgs, queryArgs, function (prev, cur) {
      return _.isEmpty(cur) ? prev : cur;
    });
    var conf = baked.initConf(window, window, {
      logger: logger,
      helpers: {
        url_to: localRouter.router.urlToDynCb()
      },
      args: args
    });
    return conf;
  }

  function getArgs(router) {
    function getParameterByName(name) {
      name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
      var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
      var results = regex.exec(location.search);
      return (!results) ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    }
    return _.reduce(router.params, function (args, param) {
      args[param] = getParameterByName(param);
      return args;
    }, {});
  }

  function buildNotifyRendered(router) {
    function notifyRendered(window, conf, maybeRef) {
      var document = window.document;

      var e = document.createEvent("HTMLEvents");
      e.initEvent("prismic:rendered", true, true);
      e.ref = maybeRef;
      document.dispatchEvent(e);
    }
    return notifyRendered;
  }

  var HTML = document.querySelectorAll('html')[0];
  document.addEventListener('DOMContentLoaded', function() {

    function ajax(options) {
      var deferred = Q.defer();
      var request = new XMLHttpRequest();
      request.open(options.method || 'GET', options.url, true);
      _.each(options.headers, function (value, header) {
        request.setRequestHeader(header, value);
      });
      request.onreadystatechange = function(e) {
        if (request.readyState !== 4) {
          return;
        }
        if (request.status >= 400) {
          deferred.reject(new Error('Server responded with a status of ' + request.status));
        } else {
          deferred.resolve(e.target);
        }
      };
      request.send(options.data || void 0);
      return deferred.promise;
    }

    function buildRouter() {
      return ajax({url: '/_router.json' })
        .then(function (response) {
          var routerInfos = JSON.parse(response.responseText);
          var router = Router.create(routerInfos.params, {logger: logger});
          var routerInfosForFile = window.routerInfosForFile;
          var localRouter = LocalRouter.create(routerInfosForFile, router);
          return localRouter;
        });
    }

    function getTemplate(localRouter) {
      var templateURL = localRouter.localInfos.src + '.tmpl';
      return ajax({url: templateURL}).then(function (response) {
        return response.responseText;
      });
    }

    buildRouter()
      .then(function (localRouter) {
        return getTemplate(localRouter).then(function (content) {
          if (!_.isEmpty(location.search)) {
            HTML.style.display = 'none';
            document.body.innerHTML = content;
          }
        }).then(function () {
          var conf = window.prismicSinglePage;
          if (!conf) { window.prismicSinglePage = conf = prepareConf(localRouter); }
          return baked.render(window, localRouter.router, {conf: conf, notifyRendered: buildNotifyRendered(localRouter.router)}, window)
            .fin(function() { HTML.style.display = ''; });
        });
      })
      .fin(function () {
        HTML.style.display = '';
      })
      .done(undefined, function (err) {
        logger.error(err.message);
      });

  });

})(window);

