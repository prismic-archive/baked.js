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

  function render(src, dst_static, dst_dyn) {
    console.time("Complete rendering");
    return Q
      .ninvoke(fs, 'mkdir', dst_static).catch(function (err) {
        if (!err || err.code != 'EEXIST') { throw err; }
      })
      .then(function () {
        return Q
        .ninvoke(fs, 'mkdir', dst_dyn).catch(function (err) {
          if (!err || err.code != 'EEXIST') { throw err; }
        });
      })
      .then(function () {
        return Q.ninvoke(fs, 'readdir', src);
      })
      .then(function (names) {
        return Q.all(_.map(names, function (name) {
          var src_name = src + "/" + name;
          var dst_static_name = dst_static + "/" + name;
          var dst_dyn_name = dst_dyn + "/" + name;
          console.log("read file " + src_name + "...");
          console.time("read file " + src_name + "... OK");
          return Q
            .ninvoke(fs, 'readFile', src_name, "utf8")
            .then(function (content) {
              console.timeEnd("read file " + src_name + "... OK");
              if (/\.html$/.test(name)) {
                return withWindow(content).then(function (window) {
                  console.log("render file " + src_name + "...");
                  console.time("render file " + src_name + "... OK");
                  return dorian.render(window).then(function () {
                    console.timeEnd("render file " + src_name + "... OK");
                    return [name, content, window.document.innerHTML];
                  });
                });
              } else {
                return Q.fcall(function () { return [name, content]; });
              }
            }).spread(function (name, orig, generated) {
              var to_generate = [
                [dst_static_name, generated || orig, !!generated],
                [dst_dyn_name, orig, false]
              ];
              return Q.
                all(_.map(to_generate, function (order) {
                  var act = order[2] ? "generate" : "copy";
                  console.log(act + " file " + src_name + " => " + order[0] + "...");
                  console.time(act + " file " + src_name + " => " + order[0] + "... OK");
                  return Q
                    .ninvoke(fs, 'writeFile', order[0], order[1], "utf8")
                    .then(function () {
                      console.timeEnd(act + " file " + src_name + " => " + order[0] + "... OK");
                      return order[0];
                    });
                })).then(function (generated) { return [name, generated]; });
            });
        }));
      }).then(function (res) {
        console.timeEnd("Complete rendering");
        return res;
      });
  }

  render("to_generate", "generated/static", "generated/dyn")
    .done(function () { console.log("cool cool cool"); });

}());
