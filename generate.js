var Q = require('q');
var _ = require('lodash');

var cli = require('./src/cli');
var baked = require('./src/server');

var options;
try {
  var res = cli.parse();
  options = res.options;
  if (res.rest[0]) { options.src_dir = res.rest[0]; }
  if (res.rest[1]) { options.dst_dir = res.rest[1]; }
  if (!options.src_dir) { throw new Error("Missing source dir"); }
  if (!options.dst_dir) { throw new Error("Missing static generation dir"); }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

if (options.debug) {
  Q.longStackSupport = true;
}

baked
  .generate(options)
  .done(
      function () { console.info("Ne mangez pas trop vite"); },
      function (err) { console.error(err.stack); }
    );
