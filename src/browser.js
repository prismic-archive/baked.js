var Prismic = require("prismic.io").Prismic;
var Q = require("q");
var _ = require("lodash");

var baked = require("./baked");
var Router = require("./router");
var LocalRouter = require("./local_router");

(function(window, undefined) {
  "use strict";

  if (_.isEmpty(location.search)) return;

  document.querySelector('html').style.display = 'none';

  var queryString;
  var accessToken, ref;

  function prepareConf(localRouter, content) {
    if (!queryString) {
      queryString = location.search;
      accessToken = getArg('access_token');
      ref = getArg('ref');
    }
    var localArgs = localRouter.localInfos.args;
    var args = localRouter.args();
    if (!args) {
      args = _.assign({}, localArgs, function (prev, cur) {
        return _.isEmpty(cur) ? prev : cur;
      });
    }
    var conf = baked.initConf(window, {
      logger: console,
      helpers: {
        url_to: localRouter.urlToDynCb()
      },
      args: args,
      accessToken: accessToken,
      ref: ref,
      api: localRouter.api(),
      tmpl: content
    });
    return conf;
  }

  function getArg(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
    var results = regex.exec(location.search);
    return (!results) ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
  }

  function notifyRendered(router, maybeRef) {
    var document = window.document;

    var e = document.createEvent("HTMLEvents");
    e.initEvent("prismic:rendered", true, true);
    e.ref = maybeRef;
    document.dispatchEvent(e);
  }

  var HTML = document.querySelector('html');
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
          var router = Router.create(routerInfos.params, {
            src_dir: '',
            dst_dir: ''
          });
          return LocalRouter.create(router);
        });
    }

    function getTemplate(file) {
      var templateURL = file + '.tmpl';
      return ajax({url: templateURL}).then(function (response) {
        return response.responseText;
      });
    }

    function loadPage(localRouter, infos) {
      return getTemplate(infos.src)
        .then(function (template) {
          return generateContent(template, localRouter, infos);
        });
    }

    function generateContent(content, localRouter, infos) {
      HTML.style.display = 'none';
      localRouter = localRouter.copy(infos);
      var conf = prepareConf(localRouter, content);
      if (infos && window.history) {
        window.history.pushState(infos, null, (infos.href || '') + queryString);
      }
      return baked.render(localRouter.router, {conf: conf}, window)
        .then(function (result) {
          document.body.innerHTML = result;
          listen(localRouter);
          notifyRendered(localRouter.router, conf.ref);
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
            var infos = _.assign(localRouter.urls[href], {href: href});
            loadPage(localRouter, infos)
              .done(
                function () { body.removeEventListener('click', listener); },
                function (err) { console.error(err.message); }
              );
          }
        }
      };
      body.addEventListener('click', listener);
    }

    buildRouter()
      .then(function (localRouter) {
        var infos =
          window.routerInfosForFile ||
          localRouter.findInfosFromHref(location.pathname);
        return loadPage(localRouter, infos);
      })
      .done(undefined, function (err) {
        console.error(err);
      });

  });

})(window);

