var fs = require("fs");
var dorian = require("./dorian");
var Q = require("q");
var _ = require("underscore");

(function (undefined) {
  "use strict";

  function withWindow(content, f) {
    var deferred = Q.defer();
    if (typeof window === "object" && window) {
      deferred.resolve(window);
    } else {
      require("jsdom").env(
        content,  // HTML content
        [],       // JS libs
        function (err, window) {
          if (err) {
            deferred.reject(err);
          } else {
            var scripts = window.document.querySelectorAll("script");
            _.each(scripts, function (script) {
              var src = script.getAttribute('src');
              if (src && src.match(/^(.*\/)?dorian.js$/)) {
                script.parentNode.removeChild(script);
              }
            });
            deferred.resolve(window);
          }
        }
      );
    }
    return deferred.promise;
  }

  function render() {
    return Q
      .nbind(fs.mkdir, fs)("generated").catch(function (err) { if (!err || err.code != 'EEXIST') { throw err; } })
      .then(function () { return Q.nbind(fs.readFile, fs)("to_generate/index.html", "utf8"); })
      .then(function (content) { return withWindow(content); })
      .then(function (window) { return dorian.render(window).then(function () { return window.document.innerHTML; }); })
      .then(function (generated) { return Q.nbind(fs.writeFile, fs)("generated/index.html", generated, "utf8"); });
  }

  render().done(function () { console.log("ok"); });

}());
