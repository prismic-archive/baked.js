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
    }, conf.accessToken, conf.requestHandler);
    return deferred.promise;
  }

  var DEFAULT_HELPERS = {
    _: _,
    only: function(test) {
      if (test) {
        return function (block) { block(); };
      } else {
        return function (block) {};
      }
    }
  };

  function defaultHelpers(conf) {
    return _.assign({}, DEFAULT_HELPERS, {
      onlyBrowser: DEFAULT_HELPERS.only(conf.mode == 'browser'),
      onlyServer: DEFAULT_HELPERS.only(conf.mode == 'server')
    });
  }

  function renderTemplate(content, ctx) {
    // The vm context sandbox is kept separate from the template context to work around an issue
    // in earlier versions of node (pre v0.11.7) where escape() is added to the template context.
    if (!ctx._sandbox) {
      ctx._sandbox = vm.createContext(ctx);
    }
    ejs.open = '[%';
    ejs.close = '%]';
    ctx._sandbox.__render__ = function render() {
      delete ctx._sandbox.__render__;
      return ejs.render(content, ctx);
    };

    return vm.runInContext("__render__()", ctx._sandbox);
  }

  function requireFile(content, ctx, filename) {
    return vm.runInContext(content, ctx._sandbox, filename);
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

  function queryHelperForm(ctx) {
    return function (name) {
      var form = ctx.api
                    .form(name || "everything")
                    .ref(ctx.ref || ctx.master);
      var submit = form.submit.bind(form);
      form.submit = function (f) {
        var deferred = Q.defer();
        submit(function(err, res) {
          if (err) { deferred.reject(err); }
          else { deferred.resolve(f ? Q(res).then(f) : res); }
        });
        return deferred.promise;
      };
      return form;
    };
  }
  function queryHelperAjax(ctx) {
    function prepareResp(resp) {
      var json;
      Object.defineProperty(resp, "json", {
        get: function () {
          if (!json) {
            json = JSON.parse(this.body);
          }
          return json;
        }
      });
      return resp;
    }
    if (ctx.mode == 'server') {
      var http = require('http');
      var https = require('https');
      var URL = require('url');
      return function (url, method) {
        var parsed = URL.parse(url);
        var options = {
          method: method || 'GET',
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.path,
          query: parsed.query
        };
        var h = parsed.protocol == 'https:' ? https : http;
        var deferred = Q.defer();
        var req = h.request(options, function(response) {
          if (response.statusCode &&
              response.statusCode >= 200 &&
              response.statusCode < 300) {
            var body = [];
            response.on('data', function (chunk) {
              body.push(chunk);
            });
            response.on('end', function () {
              deferred.resolve(prepareResp({
                body: body.join(""),
                statusCode: response.statusCode,
                headers: response.headers
              }));
            });
          } else {
            deferred.reject(
              new Error("Unexpected status code [" + response.statusCode + "] on URL " + url),
              null
            );
          }
        });
        if (options.data) {
          req.write(options.data);
        }
        req.end();
        return deferred.promise;
      };
    } else {
      return function (url, method) {
        var xhr = new XMLHttpRequest();
        var deferred = Q.defer();
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            if (xhr.status &&
                xhr.status >= 200 &&
                xhr.status < 300) {
              deferred.resolve(prepareResp({
                body: xhr.responseText,
                statusCode: xhr.status,
                headers: xhr.getAllResponseHeaders()
              }));
            } else {
              var status = xhr.status;
              deferred.reject(new Error("Unexpected status code [" + status + "] on URL " + url));
            }
          }
        };
        xhr.open(method || 'GET', url, true);
        xhr.send();
        return deferred.promise;
      };
    }
  }
  function queryHelperJsonP(ctx) {
    if (ctx.mode == 'server') {
      return queryHelperAjax(ctx);  // no need for JSONP server-side
    } else {
      return function (url) {
        var deferred = Q.defer();
        var callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
        window[callbackName] = function(data) {
          delete window[callbackName];
          document.body.removeChild(script);
          var resp = {
            statusCode: 200,
            headers: {},
            json: data
          };
          var body;
          Object.defineProperty(resp, "body", {
            get: function () {
              if (!body) {
                body = JSON.stringify(this.json);
              }
              return body;
            }
          });
          deferred.resolve(resp);
        };
        var script = document.createElement('script');
        script.onerror = function (e) {
          deferred.reject("Error while calling (with JSONP) " + url);
        };
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
        document.body.appendChild(script);
        return deferred.promise;
      };
    }
  }

  function queryHelperWithName(name) {
    return (function (value) {
      var o = {};
      o[name] = value;
      return o;
    });
  }

  function queryHelperEmptyResponse() {
    return {
      page: 1,
      results_per_page: 20,
      results_size: 0,
      total_results_size: 0,
      total_pages: 0,
      next_page: null,
      prev_page: null
    };
  }

  function initConf(opts) {
    var conf = {
      mode: opts.mode,
      env: opts.env || {},
      helpers: opts.helpers || {},
      logger: opts.logger,
      args: opts.args || {},
      ref: opts.ref,
      accessToken: opts.accessToken,
      api: opts.api,
      tmpl: opts.tmpl,
      setContext: opts.setContext || _.noop,
      requestHandler: opts.requestHandler
    };

    // The Prismic.io API endpoint
    if (!conf.api) {
      conf.logger.error(
        'Please define your api endpoint in the <head> element. ' +
        'For example: ' +
        '<meta name="prismic-api" content="https://lesbonneschoses.prismic.io/api">');
      return;
    }

    function toUpperCase(str, l) { return l.toUpperCase(); }

    // Extract the query bindings
    conf.bindings = {};
    var rxBindings = /<script +type="text\/prismic-query"([^>]*)>([\s\S]*?)<\/script>/ig;
    conf.tmpl = conf.tmpl.replace(rxBindings, function (str, scriptParams, scriptContent) {
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
          dataset: dataset,
          render: function(api) {
            return renderQuery(scriptContent, conf.args, api);
          }
        });
        conf.bindings[name] = binding;
      }
      return str.replace(/.*/g, '');  // remove the <script> tag but preserve lines number
    });

    // Extract the JS bindings
    conf.jsbindings = [];
    var rxBindingsJS = /<script +type="text\/prismic-query-js"([^>]*)>([\s\S]*?)<\/script>/ig;
    conf.tmpl = conf.tmpl.replace(rxBindingsJS, function (str, scriptParams, scriptContent) {
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
          name: name,
          dataset: dataset,
          script: scriptContent
        });
        conf.jsbindings.push(binding);
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
            return form.set(key, renderQuery(value, conf.args, api));
          }, form);
          if (binding.dataset.single) {
            form.pageSize(1);
          }
          form
            .query(binding.render(api))
            .submit(function (err, documents) {
              // skip the NodeJS specific 3rd argument (readableState...)
              if (err) { deferred.reject(err); }
              else {
                if (binding.dataset.eager) {
                  var promises = _.map(documents.results, function(doc, index) {
                    var relationshipDeferred = Q.defer();
                    var ids = _.map(doc.linkedDocuments(), 'id');

                    if (_.isEmpty(ids.length)) {
                      var query = '[[:d = any(document.id, ["' + ids.join('","') + '"]) ]]';
                      api.form("everything")
                        .ref(conf.ref || api.master())
                        .query(query)
                        .submit(function(err, relatedResults) {
                          if (err) { relationshipDeferred.reject(err); }
                          else {
                            var keys = _.map(relatedResults.results, 'id');
                            var related = _.zipObject(keys, relatedResults.results);
                            documents.results[index].loadedDocuments = related;
                            relationshipDeferred.resolve();
                          }
                        });
                    } else {
                      relationshipDeferred.resolve();
                    }

                    return relationshipDeferred.promise;
                  });
                  Q.all(promises).then(
                    function() { deferred.resolve(documents); },
                    function(err) { deferred.reject(err); }
                  );
                } else {
                  deferred.resolve(documents);
                }
              }
            });
          return deferred.promise
            .then(
              function (documents) {
                if (binding.dataset.single) {
                  documents = documents.results[0];
                }
                return [name, documents];
              },
              function (err) { conf.logger.error("Error while running query: \n%s\n", binding.predicates, err); }
            );
        }))
        .then(function (results) {
          var env = _.assign({}, {
            console: console,
            mode: conf.mode,
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
        })
        .then(function (documentSets) {
          return Q
            .all(_.map(conf.jsbindings, function(binding) {
              var ctx = vm.createContext(_.extend({}, documentSets, {
                Prismic: Prismic,  // prismic.io's Predicate
                Q: Q,
                _: _,
                form: queryHelperForm(documentSets),
                ajax: queryHelperAjax(documentSets),
                jsonp: queryHelperJsonP(documentSets),
                withName: queryHelperWithName,
                emptyResponse: queryHelperEmptyResponse
              }));
              var script = "(function(){\n" + binding.script + "\n})()";
              var res = vm.runInContext(script, ctx);
              return Q(res).then(function (value) {
                return {name: binding.name, value: value};
              });
            }))
            .then(function (allRes) {
              _.each(allRes, function (res) {
                if (res.name == '*') {
                  _.extend(documentSets, res.value);
                } else {
                  documentSets[res.name] = res.value;
                }
              });
              return documentSets;
            });
        }).then(function(documentSets) {
          documentSets.loggedIn = !!conf.accessToken;

          _.extend(documentSets, defaultHelpers(conf));
          if (conf.helpers) { _.extend(documentSets, conf.helpers); }
          _.extend(documentSets, conf.args);

          conf.setContext(documentSets);
          var result = renderContent(conf.tmpl, documentSets)
            .replace(/(<img[^>]*)data-src="([^"]*)"/ig, '$1src="$2"');

          return {api: api, content: result};
        });

    });

  };

  function parseRoutingInfos(content, ctx) {
    var rxAPI = /<meta +name="prismic-api" +content="([^"]+)" *>/ig;
    var rxParam = /<meta +name="prismic-routing-param" +content="([a-z][a-z0-9]*)" *>/ig;
    var rxPattern = /<meta +name="prismic-routing-pattern" +content="([\/$a-z][\/${}a-z0-9.-_]*)" *>/ig;
    var rxURLBase = /<meta +name="prismic-url-base" +content="([^"]+)" *>/ig;
    var match;
    var res = {
      api: ctx.api,
      url: ctx.urlBase,
      params: []
    };
    if ((match = rxAPI.exec(content)) !== null) {
      res.api = match[1];
    }
    if (!res.api) { return null; }  // no api == no template
    while ((match = rxParam.exec(content)) !== null) {
      res.params.push(match[1]);
    }
    if ((match = rxPattern.exec(content)) !== null) {
      res.route = match[1];
    }
    if ((match = rxURLBase.exec(content)) !== null) {
      res.url = match[1];
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
