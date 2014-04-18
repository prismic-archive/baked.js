var Renderer = require("./renderer");

// TODO change-me
var fs = require("fs");

function withWindow(content, f) {
  if (typeof window === "object" && window) {
    return f(window);
  } else {
    require("jsdom").env(
      content,  // HTML content
      [],       // JS libs
      function (errors, window) {
        return f(window);
      }
    );
  }
}

function render(cb) {
  fs.mkdir("generated", function (err) {
    if (!err || err.code == 'EEXIST') {
      var content = fs.readFile("to_generate/index.html", "utf8", function (err, content) {
        if (!err) {
          withWindow(content, function (window) {
            Renderer.render(window, function (err, generated) {
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
