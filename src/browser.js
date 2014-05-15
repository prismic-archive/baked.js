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

    // AccessToken
    conf.accessToken = sessionStorage.getItem('ACCESS_TOKEN');
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

    var signin = function() {
      getAPI(conf).then(function(api) {
        document.location =
          api.data.oauthInitiate +
          '?response_type=token' +
          '&client_id=' + encodeURIComponent(conf.clientId) +
          '&redirect_uri=' + encodeURIComponent(document.location.href.replace(/#.*/, '') + '') +
          '&scope=' + encodeURIComponent('master+releases');
      }).done();
    };

    var signout = function() {
      sessionStorage.removeItem('ACCESS_TOKEN');
      conf.accessToken = undefined;
      baked
        .render(window, router, {conf: conf, notifyRendered: notifyRendered}, window)
        .done(undefined, function (err) {
          logger.error(err.message);
        });
    };

    var maybeSignInButton = document.querySelectorAll('[data-prismic-action="signin"]')[0];
    if(maybeSignInButton) {
      maybeSignInButton.addEventListener("click", signin);
    }

    var maybeSignOutButton = document.querySelectorAll('[data-prismic-action="signout"]')[0];
    if(maybeSignOutButton) {
      maybeSignOutButton.addEventListener("click", signout);
    }

    var maybeUpdateButton = document.querySelectorAll('[data-prismic-action="update"]')[0];
    if(maybeUpdateButton) {
      maybeUpdateButton.addEventListener("change", function(e) {
        baked
          .render(window, router, {conf: conf, ref: e.target.value, notifyRendered: notifyRendered}, window)
          .done(undefined, function (err) {
            logger.error(err.message);
          });
      });
    }

    var e = document.createEvent("HTMLEvents");
    e.initEvent("prismic:rendered", true, true);
    e.ref = maybeRef;
    document.dispatchEvent(e);
  }

  var HTML = document.querySelectorAll('html')[0];
  HTML.style.display = 'none';
  document.addEventListener('DOMContentLoaded', function() {

    // Handle OAuth callback
    if(document.location.hash) {
      var maybeAccessToken;
      document.location.hash.substring(1).split('&').forEach(function(data) {
        if(data.indexOf('access_token=') === 0) {
          maybeAccessToken = data.substring(13);
        }
      });
      if(maybeAccessToken) {
        sessionStorage.setItem('ACCESS_TOKEN', maybeAccessToken);
        document.location.hash = '';
      }
    }

    var conf = window.prismicSinglePage;
    if (!conf) { window.prismicSinglePage = conf = prepareConf(); }
    baked.render(window, router, {conf: conf, notifyRendered: notifyRendered}, window)
      .fin(function() { HTML.style.display = ''; })
      .done(undefined, function (err) {
        logger.error(err.message);
      });

  });

})(window);

