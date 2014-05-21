var Prismic = require("prismic.io").Prismic;
var Q = require("q");
var _ = require("lodash");

var baked = require("./baked");
var Router = require("./router");
var LocalRouter = require("./local_router");

(function(window, undefined) {
  "use strict";

  if (_.isEmpty(location.search)) return;

  function prepareConf(localRouter) {
    var queryArgs = getArgs(baked.parseRoutingInfos(window.document.head.innerHTML));
    var localArgs = localRouter.localInfos.args;
    var args = _.assign({}, localArgs, queryArgs, function (prev, cur) {
      return _.isEmpty(cur) ? prev : cur;
    });
    var conf = baked.initConf(window, window, {
      logger: console,
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
    function notifyRendered(window, maybeRef) {
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
          var router = Router.create(routerInfos.params, {logger: console});
          var routerInfosForFile = window.routerInfosForFile;
          var localRouter = LocalRouter.create(routerInfosForFile, router);
          return localRouter;
        });
    }

    function getTemplate(localRouter, file) {
      console.log("getTemplate(", file, ")");
      var templateURL = (file || localRouter.localInfos.src) + '.tmpl';
      return ajax({url: templateURL}).then(function (response) {
        return response.responseText;
      });
    }

    function loadPage(localRouter, file) {
      console.log("loadPage(", file, ")");
      var template_src;
      if (file) {
        template_src = '/' + localRouter.getFileFromHere(file);
      }
      return getTemplate(localRouter, template_src)
        .then(function (template) {
          return generateContent(template, localRouter);
        });
    }

    function generateContent(content, localRouter) {
      HTML.style.display = 'none';
      document.body.innerHTML = content;
      var conf = prepareConf(localRouter);
      return baked.render(window, localRouter.router, {conf: conf, notifyRendered: buildNotifyRendered(localRouter.router)}, window)
        .then(function () {
          listen(localRouter);
        })
        .fin(function () {
          HTML.style.display = '';
        });
    }

    function listen(localRouter) {
      var body = window.document.body;
      var listener = function (e) {
        if (e.target.nodeName == 'A') {
          var href = e.target.getAttribute('href');
          if (!/http:\/\//.test(href)) {
            e.preventDefault();
            loadPage(localRouter, href)
              .done(
                function () { body.removeEventListener('click', listener); },
                function (err) { console.log.error(err.message); }
              );
          }
        }
      };
      body.addEventListener('click', listener);
    }

    buildRouter()
      .then(function (localRouter) {
        return loadPage(localRouter);
      })
      .done(undefined, function (err) {
        console.log.error(err.message);
      });

  });

})(window);

