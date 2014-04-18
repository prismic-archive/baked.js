var Prismic = require("prismic.io").Prismic;
var ejs = require("ejs");

(function (Global, undefined) {
  "use strict";

  function Renderer(window, cb) {
    var conf = {};
    var documentSets = {};
    var document = window.document;

    function renderEJS(api) {
      documentSets.loggedIn = !!conf.accessToken;
      documentSets.refs = api.data.refs;
      documentSets.ref = api.master();
      document.body.innerHTML = ejs.render(conf.tmpl, documentSets);
      var imageSrc = document.querySelectorAll('img[data-src]');
      for(var i=0; i<imageSrc.length; i++) {
        var attr = imageSrc[i].getAttribute('data-src');
        if (attr) {
          imageSrc[i].setAttribute('src', attr);
          imageSrc[i].removeAttribute('data-src');
        }
      }
      if(cb) cb(null, document.innerHTML);
    }

    function callback(api, binding, andThen) {
      return function(err, documents) {
        if (err) {
          console.log("Error while running query: \n%s\n", conf.bindings[binding].predicates, err);
          return;
        }
        documentSets[binding] = documents.results;
        if(Object.keys(documentSets).length == Object.keys(conf.bindings).length) {
          andThen(api);
        }
      };
    }

    function parseRequests(andThen) {
      Prismic.Api(conf.api, function(err, api) {
        if (err) {
          console.log("Error while fetching Api at %s", conf.api, err);
          return;
        }
        for(var binding in conf.bindings) {
          api.form(conf.bindings[binding].form).ref(api.master())
             .query(conf.bindings[binding].predicates)
             .submit(callback(api, binding, andThen));
        }
      });
    }

    // The Prismic.io API endpoint
    try {
      conf.api = document.querySelectorAll('head meta[name="prismic-api"]')[0].content;
    } catch(e) {
      cb('Please define your api endpoint in the <head> element. ' +
        'For example: <meta name="prismic-api" content="https://lesbonneschoses.prismic.io/api">');
      return;
    }
    // OAuth client id (optional)
    try {
      conf.clientId = document.querySelectorAll('head meta[name="prismic-oauth-client-id"]')[0].content;
    } catch(e) {}
    // Extract the bindings
    conf.bindings = {};
    var queryScripts = document.querySelectorAll('script[type="text/prismic-query"]');
    for(var i=0; i<queryScripts.length; i++) {
      var node = queryScripts[i];
      conf.bindings[node.getAttribute('data-binding') || ""] = {
        form: node.getAttribute('data-form') || 'everything',
        predicates: node.textContent
      };
      node.parentNode.removeChild(node);
    }
    // Extract the template
    ejs.open = '[%'; ejs.close = '%]';
    conf.tmpl = document.body.innerHTML;
    parseRequests(renderEJS);
  }

  Global.render = Renderer;

}(typeof exports === 'object' && exports ? exports : (typeof module === "object" && module && typeof module.exports === "object" ? module.exports : window)));
