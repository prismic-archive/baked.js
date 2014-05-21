var Q = require('q');
var _ = require('lodash');

var baked = require('./src/server');

function usage() {
  var pwd = '/' + _.compact((process.env.PWD || '').split('/')).join('/') + '/';
  var name = _.first(process.argv, 2).join(' ').replace(pwd, '');
  var msg =
    "usage: " + name + " [opts] <src> <dest>\n" +
    "\n" +
    "opts:\n" +
    "  --[no-]async    -- Run asynchronously (default: true)\n" +
    "  --[no-]debug    -- Better stacktraces (default: false)\n";
  console.log(msg);
}

function die(msg, showUsage) {
  if (showUsage) { usage(); }
  console.warn("Error:", msg);
  process.exit(1);
}

var async = true;
var debug = false;
var src_dir;
var dst_dir;
_.each(process.argv.slice(2), function (arg) {
  switch (arg) {
    case '--async' : async = true; break;
    case '--no-async' : async = false; break;
    case '-d' :
    case '--debug' : debug = true; break;
    case '--no-debug' : debug = false; break;
    default :
      if (!src_dir) {
        src_dir = arg;
      } else if (!dst_dir) {
        dst_dir = arg;
      } else {
        usage();
        die("Bad argument:" + arg);
      }
  }
});

if (!src_dir) {
  die("Missing source dir", true);
}
if (!dst_dir) {
  die("Missing static generation dir", true);
}

if (debug) {
  Q.longStackSupport = true;
}

baked.generate(src_dir, dst_dir, {async: async, debug: debug});
