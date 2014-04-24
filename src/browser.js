var Prismic = require("prismic.io").Prismic;
var ejs = require("ejs");
var Q = require("q");
var _ = require("underscore");
var dorian = require("dorian");

(function(window, undefined) {
  "use strict";

  function prepareConf() {
    var conf = dorian.initConf(window);
    // AccessToken
    conf.accessToken = sessionStorage.getItem('ACCESS_TOKEN');
    return conf;
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
      render(window, conf, undefined, notifyRendered).done();
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
        render(window, conf, e.target.value, notifyRendered).done();
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
    dorian.render(window, conf, undefined, notifyRendered)
      .fin(function() { HTML.style.display = ''; })
      .done();

  });

})(window);

