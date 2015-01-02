var _ = require('lodash');

(function (global, undefined) {
  "use strict";

  function usage() {
    var pwd = '/' + _.compact((process.env.PWD || '').split('/')).join('/') + '/';
    var name = _.first(process.argv, 2).join(' ').replace(pwd, '');
    var msg =
      "usage: " + name + " [opts]\n" +
      "\n" +
      "opts:\n" +
      "  --src <src>       -- The source directory" +
      "  --dst <dst>       -- The destination directory" +
      "  --config <config> -- Configuration file" +
      "  --config <config> -- Configuration file" +
      "  --[no-]async      -- Run asynchronously (default: true)\n" +
      "  --[no-]debug      -- Better stacktraces (default: false)\n" +
      "  --ignore <ptn>    -- Ignore a file/dir (can be call multiple times)\n";
    return msg;
  }

  function parse(args) {
    if (!args) { args = process.argv.slice(2); }
    var options = {
      ignore: []
    };
    var rest = [];
    for (var i=0; i<args.length; i++) {
      var arg = args[i];
      switch (arg) {
        case '--async' : options.async = true; break;
        case '--no-async' : options.async = false; break;
        case '-d' :
        case '--debug' : options.debug = true; break;
        case '--no-debug' : options.debug = false; break;
        case '--config' :
          i++;
          var configFile = args[i];
          if (!configFile) { throw new Error("missing config"); }
          options.configFile = configFile;
          break;
        case '--src' :
          i++;
          var src = args[i];
          if (!src) { throw new Error("missing src"); }
          options.srcDir = src;
          break;
        case '--dst' :
          i++;
          var dst = args[i];
          if (!dst) { throw new Error("missing dst"); }
          options.dstDir = dst;
          break;
        case '--ignore' :
          i++;
          var ignore = args[i];
          if (!ignore) { throw new Error("missing ignore pattern"); }
          options.ignore.push(ignore);
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
