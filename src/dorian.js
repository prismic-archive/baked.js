var Renderer = require("./renderer");

// TODO change-me
var fs = require("fs");

function render(cb) {
  fs.mkdir("generated", function (err) {
    if (!err || err.code == 'EEXIST') {
      var content = fs.readFile("to_generate/index.html", "utf8", function (err, content) {
        if (!err) {
          Renderer.render(content, function (generated) {
            fs.writeFile("generated/index.html", generated, "utf8", function (err) {
              if (!err) {
                if (cb) cb();
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
