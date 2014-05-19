var Prismic = require("prismic.io").Prismic;
var Q = require("q");
var _ = require("lodash");

(function (exporter, undefined) {
  "use strict";

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

  function cleanEnv(global) {
    var cleaned = {};
    // _.each skips some keys (like console)...
    for (var prop in global) {
      if (global.hasOwnProperty(prop)) {
        cleaned[prop] = undefined;
      }
    }
    return cleaned;
  }

  function renderTemplate(content, env, global) {
    var clean = cleanEnv(global);
    return _.template(content, null, {
      escape: /\[%-([\s\S]+?)%\]/g,
      evaluate: /\[%([\s\S]+?)%\]/g,
      interpolate: /\[%=([\s\S]+?)%\]/g,
    }).call(env, _.assign({}, clean, env));
  }

  function renderContent(global, content, env) {
    return renderTemplate(content, env, global);
  }

  function renderQuery(global, query, env) {
    var rx = /\$(([a-z][a-z0-9]*)|\{([a-z][a-z0-9]*)\})/ig;
    return query.replace(rx, function (str, simple, complex) {
      var variable = simple || complex;
      return env && env[variable] || '';
    }).replace(/\$\$/g, '$');
  }

  function renderRoute(route, env) {
    var rx = /\$(([a-z][a-z0-9]*)|\{([a-z][a-z0-9]*)\})/ig;
    return route.replace(rx, function (str, simple, complex) {
      var variable = simple || complex;
      return env && env[variable] || '';
    });
  }

  function initConf(global, window, opts) {
    var document = window.document;
    var conf = _.extend({
      env: opts.env || {},
      helpers: opts.helpers || {},
      logger: opts.logger || window.console,
      args: opts.args || {}
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
      var binding = {
        params: {}
      };
      _.each(node.attributes, function (attr) {
        var match = /^data-query-(.+)/.exec(attr.nodeName);
        if (match) {
          binding.params[match[1]] = attr.nodeValue;
        }
      });
      var name = node.getAttribute("data-binding");
      if (name) {
        _.assign(binding, {
          form: node.getAttribute("data-form") || 'everything',
          predicates: renderQuery(global, node.textContent, conf.args)
        });
        conf.bindings[name] = binding;
      }
      node.parentNode.removeChild(node);
    });
    // Extract the template
    conf.tmpl = document.body.innerHTML;

    return conf;
  }

  function initRender(window, router, opts, global) {
    if (!opts) { opts = {}; }
    var conf = opts.conf || initConf(global, window, opts);
    return render(window, router, conf, opts.ref, opts.notifyRendered, global);
  }

  var render = function(window, router, conf, maybeRef, notifyRendered, global) {
    var document = window.document;
    return getAPI(conf).then(function(api) {
      return Q
        .all(_.map(conf.bindings, function(binding, name) {
          var deferred = Q.defer();
          var form = api.form(binding.form);
          form = form.ref(maybeRef || api.master());
          form = _.reduce(binding.params, function (form, value, key) {
            return form.set(key, value);
          }, form);
          form
            .query(binding.predicates)
            .submit(deferred.makeNodeResolver());
          return deferred.promise
            .then(
              function (documents) { return [name, documents.results]; },
              function (err) { conf.logger.error("Error while running query: \n%s\n", binding.predicates, err); }
            );
        }))
        .then(function (results) {
          var env = _.assign({}, {
            api: api,
            bookmarks: api.bookmarks,
            types: api.types,
            tags: api.tags,
            master: api.master.ref
          }, conf.env);
          return _.reduce(results, function (documentSets, res) {
            if(res) {
              documentSets[res[0]] = res[1];
            }
            return documentSets;
          }, env);
        }).then(function(documentSets) {
          documentSets.loggedIn = !!conf.accessToken;
          documentSets.refs = api.data.refs;
          documentSets.ref = maybeRef || api.master();

          _.extend(documentSets, defaultHelpers);
          if (conf.helpers) { _.extend(documentSets, conf.helpers); }
          _.extend(documentSets, conf.args);

          document.body.innerHTML = renderContent(global, conf.tmpl, documentSets);

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
