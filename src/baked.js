var _ = require("lodash");
var ejs = require("ejs");
var Prismic = require("prismic.io").Prismic;
var Q = require("q");
var vm = require("vm");

(function (exporter, undefined) {
  "use strict";

  function getAPI(conf) {
    var deferred = Q.defer();
    Prismic.Api(conf.api, function(err, api) {
      if (err) {
        err.url = conf.api;
        deferred.reject(err);
      }
      else deferred.resolve(api);
    }, conf.accessToken);
    return deferred.promise;
  }

  var defaultHelpers = {
    _: _
  };

  function renderTemplate(content, ctx) {
    ejs.open = '[%';
    ejs.close = '%]';
    ctx.__render__ = function render() {
      delete ctx.__render__;
      return ejs.render(content, ctx);
    };

    return vm.runInContext("__render__()", ctx);
  }

  function requireFile(content, ctx, filename) {
    return vm.runInContext(content, ctx, filename);
  }

  function renderContent(content, ctx) {
    return renderTemplate(content, ctx);
  }

  function renderQuery(query, env, api) {
    env = env || {};
    var rxVar = /(^|[^$])\$(([a-z][a-z0-9]*)|\{([a-z][a-z0-9]*)\})/ig;
    var rxBookmark = /(^|[^$])\$\{bookmarks(\.([-_a-zA-Z0-9]+)|\[(['"])([-_a-zA-Z0-9]+)\4\])\}/ig;
    return query
      .replace(rxVar, function (str, prev, _, simple, complex) {
        return prev + (env[simple || complex] || '');
      })
      .replace(rxBookmark, function (str, prev, _1, bookmarkDot, _2, bookmarkBraket) {
        return prev + (api.bookmarks[bookmarkDot || bookmarkBraket] || '');
      })
      .replace(/\$\$/g, '$');
  }

  function renderRoute(route, env) {
    var rx = /\$(([a-z][a-z0-9]*)|\{([a-z][a-z0-9]*)\})/ig;
    return route.replace(rx, function (str, simple, complex) {
      var variable = simple || complex;
      return env && env[variable] || '';
    });
  }

  function initConf(opts) {
    var conf = {
      env: opts.env || {},
      helpers: opts.helpers || {},
      logger: opts.logger,
      args: opts.args || {},
      ref: opts.ref,
      accessToken: opts.accessToken,
      api: opts.api,
      tmpl: opts.tmpl,
      setContext: opts.setContext || _.noop
    };

    // The Prismic.io API endpoint
    if (!conf.api) {
      conf.logger.error(
        'Please define your api endpoint in the <head> element. ' +
        'For example: ' +
        '<meta name="prismic-api" content="https://lesbonneschoses.prismic.io/api">');
      return;
    }

    // Extract the bindings
    conf.bindings = {};
    function toUpperCase(str, l) { return l.toUpperCase(); }
    var scriptRx = /<script +type="text\/prismic-query"([^>]*)>([\s\S]*?)<\/script>/ig;
    conf.tmpl = conf.tmpl.replace(scriptRx, function (str, scriptParams, scriptContent) {
      var dataRx = /data-([a-z0-9\-]+)="([^"]*)"/ig;
      var dataset = {};
      var match;
      var binding = {
        params: {}
      };
      while ((match = dataRx.exec(scriptParams)) !== null) {
        var attribute = match[1].toLowerCase();
        var value = match[2];
        var key;
        if (/^query-/.test(attribute)) {
          key = attribute.replace(/^query-/, '').replace(/-(.)/g, toUpperCase);
          binding.params[key] = value;
        } else {
          key = attribute.replace(/-(.)/g, toUpperCase);
          dataset[key] = value;
        }
      }
      var name = dataset.binding;
      if (name) {
        _.assign(binding, {
          form: dataset.form || 'everything',
          render: function(api) {
            return renderQuery(scriptContent, conf.args, api);
          }
        });
        conf.bindings[name] = binding;
      }
      return str.replace(/.*/g, '');  // remove the <script> tag but preserve lines number
    });

    return conf;
  }

  function initRender(router, opts) {
    if (!opts) { opts = {}; }
    var conf = opts.conf || initConf(opts);
    return render(router, conf);
  }

  var render = function(router, conf) {
    return getAPI(conf).then(function(api) {
      return Q
        .all(_.map(conf.bindings, function(binding, name) {
          var deferred = Q.defer();
          var form = api.form(binding.form);
          form = form.ref(conf.ref || api.master());
          form = _.reduce(binding.params, function (form, value, key) {
            return form.set(key, value);
          }, form);
          form
            .query(binding.render(api))
            .submit(function (err, documents) {
              // skip the NodeJS specific 3rd argument (readableState...)
              if (err) { deferred.reject(err); }
              else { deferred.resolve(documents); }
            });
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
            refs: api.data.refs,
            tags: api.data.tags,
            master: api.master(),
            ref: conf.ref
          }, conf.env);
          return _.reduce(results, function (documentSets, res) {
            if(res) {
              documentSets[res[0]] = res[1];
            }
            return documentSets;
          }, env);
        }).then(function(documentSets) {
          documentSets.loggedIn = !!conf.accessToken;

          _.extend(documentSets, defaultHelpers);
          if (conf.helpers) { _.extend(documentSets, conf.helpers); }
          _.extend(documentSets, conf.args);

          var ctx = vm.createContext(documentSets);
          conf.setContext(ctx);
          var result = renderContent(conf.tmpl, ctx)
            .replace(/(<img[^>]*)data-src="([^"]*)"/ig, '$1src="$2"');

          return {api: api, content: result};
        });

    }, conf.accessToken);

  };

  function parseRoutingInfos(content) {
    var rxAPI = /<meta +name="prismic-api" +content="([^"]+)" *>/ig;
    var rxParam = /<meta +name="prismic-routing-param" +content="([a-z][a-z0-9]*)" *>/ig;
    var rxPattern = /<meta +name="prismic-routing-pattern" +content="([\/$a-z][\/${}a-z0-9.-_]*)" *>/ig;
    var match;
    var res = {
      params: []
    };
    if ((match = rxAPI.exec(content)) !== null) {
      res.api = match[1];
    } else {
      return null;  // no api == no template
    }
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
  exporter.renderTemplate = renderTemplate;
  exporter.requireFile = requireFile;

}(typeof exports === 'object' && exports ? exports : (typeof module === "object" && module && typeof module.exports === "object" ? module.exports : window)));
