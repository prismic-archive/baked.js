var Prismic = require("prismic.io").Prismic;
var ejs = require("ejs");
var Q = require("q");
var _ = require("underscore");

(function (Global, undefined) {
  "use strict";

  function Renderer(window) {
    var conf = {};
    var document = window.document;
    var deferred = Q.defer();

    function renderEJS(conf, api, documentSets) {
      documentSets.loggedIn = !!conf.accessToken;
      documentSets.refs = api.data.refs;
      documentSets.ref = api.master();
      document.body.innerHTML = ejs.render(conf.tmpl, documentSets);
      var imagesSrc = document.querySelectorAll('img[data-src]');
      _.each(imagesSrc, function (imageSrc) {
        var attr = imageSrc.getAttribute('data-src');
        if (attr) {
          imageSrc.setAttribute('src', attr);
          imageSrc.removeAttribute('data-src');
        }
      });
      return Q.fcall(function() { return document.innerHTML; });
    }

    function parseRequests(conf, api) {
      var promises = _.map(conf.bindings, function (binding, name) {
        var deferred = Q.defer();
        api
          .form(binding.form)
          .ref(api.master())
          .query(binding.predicates)
          .submit(deferred.makeNodeResolver());
        return deferred.promise
          .then(
            function (documents) { return [name, documents.results]; },
            function (err) { console.log("Error while running query: \n%s\n", binding.predicates, err); }
          );
      });
      return Q.all(promises).then(function (results) {
        return _.reduce(results, function (memo, nameResult) {
          var name = nameResult[0];
          var result = nameResult[1];
          memo[name] = result;
          return memo;
        }, {});
      });
    }

    // The Prismic.io API endpoint
    try {
      conf.api = document.querySelectorAll('head meta[name="prismic-api"]')[0].content;
    } catch(e) {
      deferred.reject('Please define your api endpoint in the <head> element. ' +
        'For example: <meta name="prismic-api" content="https://lesbonneschoses.prismic.io/api">');
      return deferred.promise;
    }
    // OAuth client id (optional)
    try {
      conf.clientId = document.querySelectorAll('head meta[name="prismic-oauth-client-id"]')[0].content;
    } catch(e) {}
    // Extract the bindings
    conf.bindings = {};
    var queryScripts = document.querySelectorAll('script[type="text/prismic-query"]');
    _.each(queryScripts, function (queryScript) {
      conf.bindings[queryScript.getAttribute('data-binding') || ""] = {
        form: queryScript.getAttribute('data-form') || 'everything',
        predicates: queryScript.textContent
      };
      queryScript.parentNode.removeChild(queryScript);
    });
    // Extract the template
    ejs.open = '[%'; ejs.close = '%]';
    conf.tmpl = document.body.innerHTML;
    deferred.resolve(Q.nbind(Prismic.Api, Prismic)(conf.api).then(function(res) {
      var api = res[0];
      return parseRequests(conf, api)
        .then(function (documentSets) { return renderEJS(conf, api, documentSets); });
    }));
    return deferred.promise;
  }

  Global.render = Renderer;

}(typeof exports === 'object' && exports ? exports : (typeof module === "object" && module && typeof module.exports === "object" ? module.exports : window)));
