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

  function render(src_dir, dst_static_dir, dst_dyn_dir) {
    return Q
      .ninvoke(fs, 'mkdir', dst_static_dir).catch(function (err) {
        if (!err || err.code != 'EEXIST') { throw err; }
      })
      .then(function () {
        return Q
        .ninvoke(fs, 'mkdir', dst_dyn_dir).catch(function (err) {
          if (!err || err.code != 'EEXIST') { throw err; }
        });
      })
      .then(function () {
        return Q.ninvoke(fs, 'readdir', src_dir);
      })
      .then(function (names) {
        return Q.all(_.map(names, function (name) {
          var src = src_dir + "/" + name;
          var dst_static = dst_static_dir + "/" + name;
          var dst_dyn = dst_dyn_dir + "/" + name;
          console.log("read file " + src + "...");
          console.time("read file " + src + "... OK");
          return Q
            .ninvoke(fs, 'lstat', src)
            .then(function (stats) {
              if (stats.isFile()) {
                return Q
                  .ninvoke(fs, 'readFile', src, "utf8")
                  .then(function (content) {
                    console.timeEnd("read file " + src + "... OK");
                    if (/\.html$/.test(name)) {
                      return withWindow(content).then(function (window) {
                        console.log("render file " + src + "...");
                        console.time("render file " + src + "... OK");
                        return dorian.render(window).then(function () {
                          console.timeEnd("render file " + src + "... OK");
                          return [name, content, window.document.innerHTML];
                        });
                      });
                    } else {
                      return Q.fcall(function () { return [name, content]; });
                    }
                  }).spread(function (name, orig, generated) {
                    var to_generate = [
                      [dst_static, generated || orig, !!generated],
                      [dst_dyn, orig, false]
                    ];
                    return Q.
                      all(_.map(to_generate, function (order) {
                        var act = order[2] ? "generate" : "copy";
                        console.log(act + " file " + src + " => " + order[0] + "...");
                        console.time(act + " file " + src + " => " + order[0] + "... OK");
                        return Q
                          .ninvoke(fs, 'writeFile', order[0], order[1], "utf8")
                          .then(function () {
                            console.timeEnd(act + " file " + src + " => " + order[0] + "... OK");
                            return order[0];
                          });
                      })).then(function (generated) { return [name, generated]; });
                  });
              } else if (stats.isDirectory()) {
                return render(src, dst_static, dst_dyn);
              } else {
                var typ;
                if (stats.isBlockDevice()) { typ = "BlockDevice"; }
                if (stats.isCharacterDevice()) { typ = "CharacterDevice"; }
                if (stats.isSymbolicLink()) { typ = "SymbolicLink"; }
                if (stats.isFIFO()) { typ = "FIFO"; }
                if (stats.isSocket()) { typ = "Socket"; }
                console.log("Ignore file " + src + " (" + typ + ")");
                return null;
              }
            });
        }));
      });
  }

  console.time("Complete rendering");
  render("to_generate", "generated/static", "generated/dyn")
    .done(function () { console.timeEnd("Complete rendering"); })

}());
