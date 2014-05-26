var _ = require('lodash');

(function (global, undefined) {
  "use strict";

  function usage() {
    var pwd = '/' + _.compact((process.env.PWD || '').split('/')).join('/') + '/';
    var name = _.first(process.argv, 2).join(' ').replace(pwd, '');
    var msg =
      "usage: " + name + " [opts] <src> <dest>\n" +
      "\n" +
      "opts:\n" +
      "  --[no-]async    -- Run asynchronously (default: true)\n" +
      "  --[no-]debug    -- Better stacktraces (default: false)\n";
    return msg;
  }

  function parse(args) {
    if (!args) { args = process.argv.slice(2); }
    var options = {};
    var rest = [];
    for (var i=0; i<args.length; i++) {
      var arg = args[i];
      switch (arg) {
        case '--async' : options.async = true; break;
        case '--no-async' : options.async = false; break;
        case '-d' :
        case '--debug' : options.debug = true; break;
        case '--no-debug' : options.debug = false; break;
        case '--src' :
          i++;
          var src = args[i];
          if (!src) { throw new Error("missing src"); }
          options.src_dir = src;
          break;
        case '--dst' :
          i++;
          var dst = args[i];
          if (!dst) { throw new Error("missing dst"); }
          options.dst_dir = dst;
          break;
        case '--' :
          rest.concat(args);
          i = args.length;
          break;
        default :
          rest.push(arg);
      }
    }
    return {
      options: options,
      rest: rest
    };
  }

  exports.usage = usage;
  exports.parse = parse;

}(global));
