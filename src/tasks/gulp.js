var http = require('http');

var _ = require('lodash');
var browserify = require('gulp-browserify');
var concat = require('gulp-concat');
var ecstatic = require('ecstatic');
var gulp = require('gulp');
var path = require('path');
var Q = require('q');
var watch = require('gulp-watch');

var cli = require('../cli');

// Reload the Baked lib
// This function allows to update the lib's code without having to restart gulp
function ReloadBaked() {
  require('../ext/starts_with');
  _.each(require.cache, function (value, key) {
    if (key.startsWith(pathTo('src'))) {
      delete require.cache[key];
    }
  });
  return require('../server');
}

// Simple options parsing
function parseOptions() {
  try {
    var res = cli.parse();
    var options = res.options;
    if (!options.src_dir) { options.src_dir = 'to_generate'; }
    if (!options.dst_dir) { options.dst_dir = 'generated'; }
    return options;
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

var initialized = false;
function init(cfg) {
  initialized = true;
  if (!cfg) cfg = {};
  _.assign(config, {
    options: cfg.options || parseOptions(),
    build_dir: cfg.build_dir || pathTo('build'),
    libName: cfg.libName || 'baked.js',
    baked: cfg.baked || require('../server')
  });
}

var config = {};
var root = path.join(__dirname, '../..');
function pathTo(localPath) {
  return path.join(root, localPath);
}

/* tasks */

gulp.task('baked:init', function() {
  if (!initialized) {
    init();
  }
});

gulp.task('baked:generate:lib', ['baked:init'], function() {
  baked = ReloadBaked();
  return gulp.src(pathTo('src/browser.js'))
    .pipe(browserify({
      options: {
        alias: ['../fake:canvas']
      }
    }))
    .pipe(concat(config.libName))
    .pipe(gulp.dest(config.build_dir));
});

gulp.task('baked:generate:content', ['baked:init'], function () {
  return Q.fcall(config.beforeGenerate || _.identity)
    .then(function () {
      return config.baked.generate(config.options);
    })
    .then(config.afterGenerate || _.identity)
    .then(
      function () { console.info("Ne mangez pas trop vite"); },
      function (err) { console.error(err.stack); throw err; }
    );
});

gulp.task('baked:copy-lib', ['baked:generate:lib', 'baked:generate:content'], function () {
  return gulp
    .src(path.join(config.build_dir, config.libName))
    .pipe(gulp.dest(config.options.dst_dir));
});

gulp.task('baked:generate', ['baked:generate:content', 'baked:copy-lib']);

gulp.task('baked:server', function () {
  var port = 8282;
  http.createServer(ecstatic({
    root: config.options.dst_dir,
    baseDir: '/',
    cache: 1,
    showDir: false,
    autoIndex: true,
    defaultExt: 'html'
  })).listen(port);
  console.info("Listen connection on http://127.0.0.1:" + port);
});

gulp.task('baked:watch:src', ['baked:init'], function () {
  gulp.watch(root + '/src/**/*.js', ['baked:generate']);
});

gulp.task('baked:watch:content', ['baked:init'], function () {
  gulp.watch(config.options.src_dir + '/**/*', ['baked:generate:content']);
});

gulp.task('baked:watch', ['baked:watch:src', 'baked:watch:content']);

/* default tasks */

gulp.task('baked:serve', ['baked:generate', 'baked:server', 'baked:watch']);
gulp.task('baked:default', ['baked:generate']);

/* exports */

exports.config = config;
exports.init = init;
exports.parseOptions = parseOptions;
exports.ReloadBaked = ReloadBaked;
