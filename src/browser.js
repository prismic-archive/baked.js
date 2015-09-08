var Prismic = require("prismic.io").Prismic;
var Q = require("q");
var _ = require("lodash");

var baked = require("./baked");
var Router = require("./router");
var LocalRouter = require("./local_router");

window.vm = require('vm');

(function(window, undefined) {
  "use strict";

  if (_.isEmpty(location.search) || (_.isNull(getArg("ref")) && _.isNull(getArg("access_token")))) return;

  document.querySelector('html').style.display = 'none';

  var HTML = document.querySelector('html');
  var queryString;
  var config = {};
  var clientId, accessToken, ref;

  function updateConfig(c) {
    _.assign(config, c);
    clientId = c.oauthClientId || clientId;
  }

  // OAuth client id (optional)
  clientId = document.querySelector('head meta[name="prismic-oauth-client-id"]');
  if (clientId) {
    clientId = clientId.content;
  }


  // Handle OAuth callback
  if (document.location.hash) {
    _.each(document.location.hash.substring(1).split('&'), function(data) {
      if (data.indexOf('access_token=') === 0) {
        accessToken = data.substring(13);
      }
    });
    if (accessToken) {
      sessionStorage.setItem('ACCESS_TOKEN', accessToken);
      document.location.hash = '';
    }
  } else {
    accessToken = sessionStorage.getItem('ACCESS_TOKEN');
  }

  function prepareConf(localRouter, content) {
    if (!queryString) {
      queryString = location.search;
      accessToken = accessToken || getArg('access_token') || "";
      ref = getArg('ref') || "";
    }
    var localArgs = localRouter.localInfos.args;
    var args = localRouter.args();
    if (!args) {
      args = _.assign({}, localArgs, function (prev, cur) {
        return _.isEmpty(cur) ? prev : cur;
      });
      if (args.clientId) { clientId = args.oauthClientId; }
    }
    var env = {};
    var conf = baked.initConf({
      mode: 'browser',
      logger: console,
      helpers: {
        pathTo: localRouter.pathToDynCb(),
        url_to: function (file, args) {
          if (!window.deprecationUrlTo) {
            console.log("url_to is deprecated, please use pathTo instead");
            window.deprecationUrlTo = true;
          }
          return localRouter.pathToDynCb()(file, args);
        },
        urlTo: localRouter.urlToDynCb(),
        pathToHere: localRouter.pathToHereDynCb(),
        urlToHere: localRouter.urlToHereDynCb(),
        partial: localRouter.partialCb(env),
        require: localRouter.requireCb(env)
      },
      args: args,
      accessToken: accessToken,
      ref: ref,
      api: localRouter.api(),
      tmpl: content,
      setContext: function (ctx) { env.ctx = ctx; }
    });

    return conf;
  }

  function getArg(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
    var results = regex.exec(location.search);
    return (!results) ? null : decodeURIComponent(results[1].replace(/\+/g, " "));
  }

  function notifyRendered(localRouter, api, conf, template, infos) {
    var document = window.document;

    function signin() {
      document.location =
        api.data.oauthInitiate +
        '?response_type=token' +
        '&client_id=' + encodeURIComponent(clientId) +
        '&redirect_uri=' + encodeURIComponent(document.location.href.replace(/#.*/, '') + '') +
        '&scope=' + encodeURIComponent('master+releases');
    }

    function signout() {
      sessionStorage.removeItem('ACCESS_TOKEN');
      accessToken = undefined;
      ref = undefined;
      generateContent(template, localRouter, infos).done();
    }

    function change(e) {
      ref = e.target.value;
      generateContent(template, localRouter, infos).done();
    }

    var signInButton = document.querySelector('[data-prismic-action="signin"]');
    if (signInButton) {
      signInButton.addEventListener("click", signin);
    }

    var signOutButton = document.querySelector('[data-prismic-action="signout"]');
    if (signOutButton) {
      signOutButton.addEventListener("click", signout);
    }

    var updateButton = document.querySelector('[data-prismic-action="update"]');
    if (updateButton) {
      updateButton.addEventListener("change", change);
    }

    var e = document.createEvent("HTMLEvents");
    e.initEvent("prismic:rendered", true, true);
    e.ref = conf.ref;
    document.dispatchEvent(e);
  }

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
        updateConfig(routerInfos.config);
        return Router.create(routerInfos.params, routerInfos.partials, routerInfos.requires, {
          srcDir: '',
          dstDir: ''
        });
      })
      .then(function (router) {
        function getFiles(kind) {
          return Q.all(_.map(router[kind + 's'], function (file) {
            return getFile(file)
              .then(function (content) {
                var res = {content: content};
                res[kind] = file;
                return res;
              });
          })).then(function (partials) {
            var infos = _.reduce(partials, function (o, v) {
              o[v[kind]] = v.content;
              return o;
            }, {});
            var res = {};
            res[kind + 's'] = infos;
            return res;
          });
        }
        return Q.all([
          getFiles('partial'),
          getFiles('require')
        ]).then(function (res) {
          var infos = _.reduce(res, function (o, kv) {
            return _.assign(o, kv);
          }, {});
          return LocalRouter.create(router, infos.partials, infos.requires);
        });
      });
  }

  function getFile(file) {
    return ajax({url: file}).then(function (response) {
      return response.responseText;
    });
  }

  function loadPage(localRouter, infos) {
    return getFile(infos.src + '.tmpl')
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
    return baked.render(localRouter.router, {conf: conf})
      .then(function (result) {
        document.body.innerHTML = result.content;
        listen(localRouter);
        notifyRendered(localRouter, result.api, conf, content, infos);
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
            .then(function () {
              body.removeEventListener('click', listener); }
            )
            .done();
        }
      }
    };
    body.addEventListener('click', listener);
  }

  function start() {
    buildRouter()
      .then(function (localRouter) {
        var infos =
          window.routerInfosForFile ||
          localRouter.findInfosFromHref(location.pathname);
        return loadPage(localRouter, infos)
          .catch(function (err) {
            if (accessToken && /^Unexpected status code \[401\]/.test(err.message)) {
              console.warn("Received 401 (Unauthorized) error:");
              console.error(err.stack);
              console.warn("Retry without access_token");
              sessionStorage.removeItem('ACCESS_TOKEN');
              accessToken = undefined;
              ref = undefined;
              return loadPage(localRouter, infos);
            }
            throw err;
          });
      })
      .done();
  }

  document.addEventListener('DOMContentLoaded', start);

})(window);

