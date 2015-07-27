var http = require('http');

var _ = require('lodash');
var ecstatic = require('ecstatic');
var gulp = require('gulp');
var path = require('path');
var Q = require('q');
var watch = require('gulp-watch');
var ignore = require('gulp-ignore');
var rimraf = require('gulp-rimraf');

// polyfill
require("./src/ext/starts_with");

var cli = require('./src/cli');
var Configuration = require('./src/configuration');

// Simple options parsing
function parseOptions() {
  try {
    var res = cli.parse();
    var options = res.options;

    // supports gulpfiles using src_dir insteaf of srcDir from baked.config
    Object.defineProperty(options, "src_dir", {
      get: function () { return options.srcDir; },
      set: function (value) { options.srcDir = value; }
    });
    Object.defineProperty(options, "dst_dir", {
      get: function () { return options.dstDir; },
      set: function (value) { options.dstDir = value; }
    });

    return options;
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

var initialized = false;
var config = {};
function init(cfg) {
  initialized = true;
  if (!cfg) cfg = {};
  var argOptions = _.defaults({}, cfg.options, {
    srcDir: "to_generate",
    dstDir: "generated"
  });

  // supports gulpfiles providing src_dir insteaf of srcDir to init()
  if (!argOptions.srcDir) { argOptions.srcDir = argOptions.src_dir; }
  if (!argOptions.dstDir) { argOptions.dstDir = argOptions.dst_dir; }

  var cliOptions = parseOptions();

  var configuration = Configuration.readFromFileSync(_.assign(argOptions, cliOptions, {
    ignore: _.union(argOptions.ignore, cliOptions.ignore)
  }));

  // supports gulpfiles using src_dir insteaf of srcDir from baked.config
  Object.defineProperty(configuration, "src_dir", {
    get: function () { return configuration.srcDir; },
    set: function (value) { configuration.srcDir = value; }
  });
  Object.defineProperty(configuration, "dst_dir", {
    get: function () { return configuration.dstDir; },
    set: function (value) { configuration.dstDir = value; }
  });

  _.assign(config, {
    options: configuration,
    buildDir: cfg.buildDir || pathTo('build'),
    baked: cfg.baked || require('./src/server')
  });
  return config;
}

var root = __dirname;
function pathTo(localPath) {
  return path.join(root, localPath);
}

/* tasks */

function defineTasks(gulp) {

  gulp.task('baked:init', function() {
    if (!initialized) {
      init();
    }
  });

  gulp.task('baked:generate', ['baked:init'], function () {
    return Q.fcall(config.beforeGenerate || _.identity)
      .then(function () {
        return config.baked.generate(config.options);
      })
      .then(config.afterGenerate || _.identity)
      .then(
        function (failures) {
          if (!_.isEmpty(failures)) {
            console.error("" + failures.length + " errors:\n");
            _.each(failures, function (failure) {
              console.error(failure.src + ": ", failure.error);
              console.error(failure.dst, "args:", failure.args||{}, "\n");
            });
          }
          console.info("Ne mangez pas trop vite");
        },
        function (err) { console.error(err.stack); throw err; }
      );
  });

  gulp.task('baked:server', function () {
    var port = 8282;
    http.createServer(ecstatic({
      root: config.options.dstDir,
      baseDir: '/',
      cache: 1,
      showDir: false,
      autoIndex: true,
      defaultExt: 'html'
    })).listen(port);
    console.info("Listen connection on http://127.0.0.1:" + port);
  });

  gulp.task('baked:watch', ['baked:init'], function () {
    gulp.watch(config.options.srcDir + '/**/*', ['baked:generate']);
  });

  gulp.task('baked:clean', ['baked:init'], function() {
    return gulp.src(config.options.dstDir + '/**/*', { read: false })
      .pipe(ignore(config.options.dstDir + ' /.gitkeep'))
      .pipe(rimraf());
  });

  /* default tasks */

  gulp.task('baked:serve', ['baked:generate', 'baked:server', 'baked:watch']);
  gulp.task('baked:default', ['baked:generate']);

}
defineTasks(gulp);

/* exports */

exports.config = config;
exports.init = init;
exports.parseOptions = parseOptions;
exports.defineTasks = defineTasks;
