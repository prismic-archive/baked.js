var fs = require("fs");
var dorian = require("./dorian");

function withWindow(content, f) {
  if (typeof window === "object" && window) {
    return f(null, window);
  } else {
    require("jsdom").env(
      content,  // HTML content
      [],       // JS libs
      function (err, window) {
        if (!err) {
          var scripts = window.document.querySelectorAll("script");
          for (var i=0; i<scripts.length; i++) {
            var script = scripts[i];
            var src = script.getAttribute('src');
            if (src && src.match(/^(.*\/)?dorian.js$/)) {
              script.parentNode.removeChild(script);
            }
          }
        }
        f(err, window);
      }
    );
  }
}

function render(cb) {
  fs.mkdir("generated", function (err) {
    if (!err || err.code == 'EEXIST') {
      var content = fs.readFile("to_generate/index.html", "utf8", function (err, content) {
        if (!err) {
          withWindow(content, function (err, window) {
            if (!err) {
              dorian.render(window, function (err, generated) {
                if (!err) {
                  fs.writeFile("generated/index.html", generated, "utf8", function (err) {
                    if (!err) {
                      if (cb) cb();
                    } else {
                      console.log(err);
                    }
                  });
                } else {
                  console.log(err);
                }
              });
            } else {
              console.log(err);
            }
          });
        } else {
          console.log(err);
        }
      });
    } else {
      console.log(err);
    }
  });
}

render(function () {
  console.log("ok");
});
