var Prismic = require("prismic.io").Prismic;
var ejs = require("ejs");
var Q = require("q");
var _ = require("underscore");

(function (Global, undefined) {
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

  function initConf(window) {
    var document = window.document;
    var conf = {};

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
      var name = node.getAttribute("data-binding");
      if (name) {
        conf.bindings[name] = {
          form: node.getAttribute("data-form") || 'everything',
          predicates: node.textContent
        };
      }
      node.parentNode.removeChild(node);
    });
    // Extract the template
    conf.tmpl = document.body.innerHTML;

    return conf;
  }

  function initRender(window, conf, notifyRendered) {
    ejs.open = '[%'; ejs.close = '%]';
    return render(window, conf || initConf(window), undefined, notifyRendered);
  }

  var render = function(window, conf, maybeRef, notifyRendered) {
    var document = window.document;
    return getAPI(conf).then(function(api) {
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

          var imagesSrc = document.querySelectorAll('img[data-src]');
          _.each(imagesSrc, function(imageSrc) {
            imageSrc.setAttribute('src', imageSrc.attributes['data-src'].value);
          });

          if(notifyRendered) setTimeout(function () {
            notifyRendered(window, conf, maybeRef, notifyRendered);
          }, 0);

          return;
        });

    }, conf.accessToken);

  };

  Global.render = initRender;
  Global.initConf = initConf;

}(typeof exports === 'object' && exports ? exports : (typeof module === "object" && module && typeof module.exports === "object" ? module.exports : window)));
