var fs = require('fs');
var path = require('path');

var Q = require("q");
var _ = require("lodash");
var winston = require('winston');

(function (Global, undefined) {
  "use strict";

  /* ***************************************************************** *** */
  /* ***                                                               *** */
  /* *** HELPERS                                                       *** */
  /* ***                                                               *** */
  /* ***************************************************************** *** */

  function buildLogger(config) {
    var level = config.debug ? 'debug' : config.loggerLevel;
    return new (winston.Logger)({
      transports: [
        new (winston.transports.Console)({
          json: false,
          timestamp: true,
          level: level,
          colorize: true
        })
      ]
    });
  }

  function removeTrailingSlash(filepath) {
    return filepath.replace(/\/$/, '');
  }

  /* ***************************************************************** *** */
  /* ***                                                               *** */
  /* *** CONFIGURATION                                                 *** */
  /* ***                                                               *** */
  /* ***************************************************************** *** */

  function getPWD() {
    // it's better to use $PWD because cwd() returns the gulpfile.js's
    // directory. However $PWD is only available on *nix systems, so we
    // still use cwd() as fallback (better than nothing).
    var pwd = process.env.PWD;
    if (!pwd) { pwd = process.cwd(); }
    return pwd;
  }

  function mergeObjWithArr(obj1, obj2) {
    return _.assign({}, obj1, obj2, function (a, b) {
      if (a === undefined) { return b; }
      if (b === undefined) { return a; }
      if (a.length === undefined || b.length === undefined) {
        return b;
      }
      return [].concat(a, b);
    });
  }

  function Configuration(json, opts) {
    var merge = mergeObjWithArr(json, opts);

    this.pwd = merge.pwd || getPWD();
    this.debug = merge.debug === undefined ? false : merge.debug;
    this.async = merge.async === undefined ? true : merge.async;
    this.loggerLevel = merge.loggerLevel || 'warn';
    this.srcDir = removeTrailingSlash(merge.srcDir || path.join(this.pwd, '.'));
    this.dstDir = removeTrailingSlash(merge.dstDir || path.join(this.pwd, 'generated'));
    this.api = merge.api;
    this.urlBase = merge.urlBase;
    this.oauthClientId = merge.oauthClientId;
    // Ignore
    this.ignore = merge.ignore || [];
    if (this.ignore.length === undefined) { this.ignore = [this.ignore]; }
    this.ignore = _.map(this.ignore, function (ignore) {
      return path.normalize(this.srcDir + "/" + ignore);
    }, this);
    if (this.dstDir.startsWith(this.pwd)) {
      this.ignore.push(this.dstDir);
    }
    this.ignore = _.map(this.ignore, function (ignore) {
      var r = ignore
        .replace(/[.]/g, "\\.")
        .replace(/[*]/g, ".*")
        .replace(/[?]/g, ".?");
      return new RegExp("^" + r + ".*", "g");
    }, this);
    //
    this.updateLogger();
  }

  Configuration.prototype.updateLogger = function () {
    // hide the logger so it does not pollute logs of the configuration
    var logger = buildLogger(this);
    Object.defineProperty(this, "logger", {
      get: function () { return logger; }
    });
  };

  function create(json, opts) {
    return new Configuration(json, opts);
  }

  function readFromFileSync(opts) {
    if (!opts) { opts = {}; }
    var pwd = opts.pwd || getPWD();
    var file = path.join(pwd, opts.configFile || 'config.json');
    var json;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      if (e.code == 'ENOENT') {
        console.warn("Config file not found");
      } else if (e instanceof SyntaxError) {
        console.error("Invalid config file");
      } else {
        console.error(e);
      }
      json = {};
    }
    return new Configuration(json, opts);
  }

  Global.create = create;
  Global.readFromFileSync = readFromFileSync;

}(typeof exports === 'object' && exports ? exports : (typeof module === "object" && module && typeof module.exports === "object" ? module.exports : window)));
