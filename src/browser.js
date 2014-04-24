var Prismic = require("prismic.io").Prismic;
var ejs = require("ejs");
var Q = require("q");
var _ = require("underscore");

(function(GLOBAL, notifyRendered) {
  "use strict";

  function getAPI(conf) {
    var deferred = Q.defer();
    Prismic.Api(conf.api, function(err, api) {
      if(err) {
        console.log("Error while fetching Api at %s", conf.api, err);
        deferred.reject(err);
      }
      else deferred.resolve(api);
    });
    return deferred.promise;
  }

  function initConf() {
    var conf = {};
    // AccessToken
    conf.accessToken = sessionStorage.getItem('ACCESS_TOKEN');

    // The Prismic.io API endpoint
    try {
      conf.api = document.querySelectorAll('head meta[name="prismic-api"]')[0].content;
    } catch(e) {
      console.error('Please define your api endpoint in the <head> element. For example: <meta name="prismic-api" content="https://lesbonneschoses.prismic.io/api">'); return;
    }

    // OAuth client id (optional)
    try {
      conf.clientId = document.querySelectorAll('head meta[name="prismic-oauth-client-id"]')[0].content;
    } catch(e) {}

    // Extract the bindings
    conf.bindings = {};
    var queryScripts = document.querySelectorAll('script[type="text/prismic-query"]');
    _.each(queryScripts, function(node) {
      conf.bindings[node.dataset.binding || ""] = {
        form: node.dataset.form || 'everything',
        predicates: node.textContent
      };
      node.parentNode.removeChild(node);
    });
    // Extract the template
    conf.tmpl = document.body.innerHTML;

    return conf;
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


    ejs.open = '[%'; ejs.close = '%]';
    var conf = GLOBAL.prismicSinglePage;
    if (!conf) { GLOBAL.prismicSinglePage = conf = initConf();}
    render(conf)
      .fin(function() { HTML.style.display = ''; })
      .done();

  });

  var render = function(conf, maybeRef) {
    return getAPI(conf).then(function(api) {
      var documentSets = {};

      return Q
        .all(_.map(conf.bindings, function(binding, name) {
          var deferred = Q.defer();
          api
            .form(binding.form)
            .ref(maybeRef || api.master())
            .query(binding.predicates)
            .submit(deferred.makeNodeResolver());
          return deferred.promise
            .then(
              function (documents) { return [name, documents.results]; },
              function (err) { console.log("Error while running query: \n%s\n", binding.predicates, err); }
            );
        }))
        .then(function (results) {
          return _.reduce(results, function (documentSets, res) {
            if(res) {
              documentSets[res[0]] = res[1];
            }
            return documentSets;
          }, {});
        }).then(function(documentSets) {
          documentSets.loggedIn = !!conf.accessToken;
          documentSets.refs = api.data.refs;
          documentSets.ref = maybeRef || api.master();

          document.body.innerHTML = ejs.render(conf.tmpl, documentSets);

          var maybeSignInButton = document.querySelectorAll('[data-prismic-action="signin"]')[0];
          if(maybeSignInButton) {
            maybeSignInButton.addEventListener("click", function () { signin(conf); });
          }

          var maybeSignOutButton = document.querySelectorAll('[data-prismic-action="signout"]')[0];
          if(maybeSignOutButton) {
            maybeSignOutButton.addEventListener("click", function () { signout(conf); });
          }

          var maybeUpdateButton = document.querySelectorAll('[data-prismic-action="update"]')[0];
          if(maybeUpdateButton) {
            maybeUpdateButton.addEventListener("change", function(e) {
              render(conf, e.target.value).done();
            });
          }

          var imagesSrc = document.querySelectorAll('img[data-src]');
          _.each(imagesSrc, function(imageSrc) {
            imageSrc.setAttribute('src', imageSrc.attributes['data-src'].value);
          });

          if(notifyRendered) setTimeout(notifyRendered, 0);

          return;
        });

    }, conf.accessToken);

  };

  var signin = function(conf) {
    getAPI(conf).then(function(api) {
      document.location =
        api.data.oauthInitiate +
        '?response_type=token' +
        '&client_id=' + encodeURIComponent(conf.clientId) +
        '&redirect_uri=' + encodeURIComponent(document.location.href.replace(/#.*/, '') + '') +
        '&scope=' + encodeURIComponent('master+releases');
    }).done();
  };

  var signout = function(conf) {
    sessionStorage.removeItem('ACCESS_TOKEN');
    conf.accessToken = undefined;
    render(conf).done();
  };

})(window, function() {

  var e = document.createEvent("HTMLEvents");
  e.initEvent("prismic:rendered", true, true);
  document.dispatchEvent(e);

});

