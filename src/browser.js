var Prismic = require("prismic.io").Prismic;
var ejs = require("ejs");
var _ = require("underscore");

(function(GLOBAL, notifyRendered) {

  var conf = GLOBAL.prismicSinglePage || {};
  GLOBAL.prismicSinglePage = conf;

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
    _.each(queryScripts, function (node) {
      conf.bindings[node.dataset.binding || ""] = {
        form: node.dataset.form || 'everything',
        predicates: node.textContent
      };
      node.parentNode.removeChild(node);
    });
    // Extract the template
    ejs.open = '[%'; ejs.close = '%]';
    conf.tmpl = document.body.innerHTML;

    render(undefined, function() {
      HTML.style.display = '';
    });

  });

  var render = function(maybeRef, cb) {
    Prismic.Api(conf.api, function(err, Api) {
      if (err) { console.log("Error while fetching Api at %s", conf.api, err); return; }

      var documentSets = {};

      _.each(conf.bindings, function (binding, name) {
        Api.form(binding.form).ref(maybeRef || Api.master()).query(binding.predicates).submit(
          function(err, documents) {
            if (err) { console.log("Error while running query: \n%s\n", conf.bindings[name].predicates, err); return; }
            documentSets[name] = documents.results;
            if(Object.keys(documentSets).length == Object.keys(conf.bindings).length) {

              documentSets.loggedIn = !!conf.accessToken;
              documentSets.refs = Api.data.refs;
              documentSets.ref = maybeRef || Api.master();

              document.body.innerHTML = ejs.render(conf.tmpl, documentSets);

              var maybeSignInButton = document.querySelectorAll('[data-prismic-action="signin"]')[0];
              if(maybeSignInButton) maybeSignInButton.addEventListener("click", signin);

              var maybeSignOutButton = document.querySelectorAll('[data-prismic-action="signout"]')[0];
              if(maybeSignOutButton) maybeSignOutButton.addEventListener("click", signout);

              var maybeUpdateButton = document.querySelectorAll('[data-prismic-action="update"]')[0];
              if(maybeUpdateButton) maybeUpdateButton.addEventListener("change", function(e) {
                update(e.target.value);
              });

              var imagesSrc = document.querySelectorAll('img[data-src]');
              _.each(imagesSrc, function (imageSrc) {
                imageSrc.setAttribute('src', imageSrc.attributes['data-src'].value);
              });

              if(notifyRendered) setTimeout(notifyRendered, 0);

              if(cb) cb();
            }
          }
        );
      });

    }, conf.accessToken);

  };

  var update = function(ref) {
    render(ref);
  };

  var signin = function() {
    Prismic.Api(conf.api, function(err, Api) {
      document.location =
       Api.data.oauthInitiate +
       '?response_type=token' +
       '&client_id=' + encodeURIComponent(conf.clientId) +
       '&redirect_uri=' + encodeURIComponent(document.location.href.replace(/#.*/, '') + '') +
       '&scope=' + encodeURIComponent('master+releases');
    });
  };

  var signout = function() {
    sessionStorage.removeItem('ACCESS_TOKEN');
    conf.accessToken = undefined;
    render();
  };

})(window, function() {

  var e = document.createEvent("HTMLEvents");
  e.initEvent("prismic:rendered", true, true);
  document.dispatchEvent(e);

});

