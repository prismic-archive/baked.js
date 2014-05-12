var Prismic = require("prismic.io").Prismic;
var ejs = require("ejs");
var Q = require("q");
var _ = require("lodash");

(function (exporter, undefined) {
  "use strict";

  ejs.open = '[%'; ejs.close = '%]';

  function getAPI(conf) {
    var deferred = Q.defer();
    Prismic.Api(conf.api, function(err, api) {
      if(err) {
        conf.logger.error("Error while fetching Api at %s", conf.api, err);
        deferred.reject(err);
      }
      else deferred.resolve(api);
    });
    return deferred.promise;
  }

  var defaultHelpers = {
    _: _
  };

  function renderContent(content, env) {
    return ejs.render(content, env);
  }

  function renderQuery(query, env) {
    var rx = /\$(([a-z][a-z0-9]*)|\{([a-z][a-z0-9]*)\})/ig;
    var replaced = query.replace(rx, function (str, simple, complex) {
      var variable = simple || complex;
      return env && env[variable] || '';
    }).replace(/\$\$/g, '$');
    return ejs.render(replaced, env);
  }

  function renderRoute(route, env) {
    var rx = /\$(([a-z][a-z0-9]*)|\{([a-z][a-z0-9]*)\})/ig;
    return route.replace(rx, function (str, simple, complex) {
      var variable = simple || complex;
      return env && env[variable] || '';
    });
  }

  function initConf(window, opts) {
    var document = window.document;
    var conf = _.extend({
      helpers: opts.helpers || {},
      logger: opts.logger || window.console,
      args: opts.args
    }, conf);

    // The Prismic.io API endpoint
    try {
      conf.api = document.querySelectorAll('head meta[name="prismic-api"]')[0].content;
    } catch(e) {
      conf.logger.error('Please define your api endpoint in the <head> element. For example: <meta name="prismic-api" content="https://lesbonneschoses.prismic.io/api">'); return;
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
          predicates: renderQuery(node.textContent, conf.args)
        };
      }
      node.parentNode.removeChild(node);
    });
    // Extract the template
    conf.tmpl = document.body.innerHTML;

    return conf;
  }

  function initRender(window, router, opts) {
    if (!opts) { opts = {}; }
    var conf = opts.conf || initConf(window, opts);
    return render(window, router, conf, opts.ref, opts.notifyRendered);
  }

  var render = function(window, router, conf, maybeRef, notifyRendered) {
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
              function (err) { conf.logger.error("Error while running query: \n%s\n", binding.predicates, err); }
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

          _.extend(documentSets, defaultHelpers);
          if (conf.helpers) { _.extend(documentSets, conf.helpers); }

          _.extend(documentSets, conf.args);

          document.body.innerHTML = renderContent(conf.tmpl, documentSets);

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

  function parseRoutingInfos(content) {
    var rxParam = /<meta +name="prismic-routing-param" +content="([a-z][a-z0-9]*)" *>/ig;
    var rxPattern = /<meta +name="prismic-routing-pattern" +content="([\/$a-z][\/${}a-z0-9.-_]*)" *>/ig;
    var match;
    var res = {
      params: []
    };
    while ((match = rxParam.exec(content)) !== null) {
      res.params.push(match[1]);
    }
    if ((match = rxPattern.exec(content)) !== null) {
      res.route = match[1];
    }
    return res;
  }

  exporter.render = initRender;
  exporter.initConf = initConf;
  exporter.parseRoutingInfos = parseRoutingInfos;
  exporter.renderRoute = renderRoute;

}(typeof exports === 'object' && exports ? exports : (typeof module === "object" && module && typeof module.exports === "object" ? module.exports : window)));
