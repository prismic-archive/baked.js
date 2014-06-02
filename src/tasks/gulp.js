var http = require('http');

var _ = require('lodash');
var browserify = require('gulp-browserify');
var concat = require('gulp-concat');
var ecstatic = require('ecstatic');
var gulp = require('gulp');
var Q = require('q');
var watch = require('gulp-watch');

var cli = require('../cli');

// Reload the Baked lib
// This function allows to update the lib's code without having to restart gulp
function ReloadBaked() {
  require('../ext/starts_with');
  _.each(require.cache, function (value, key) {
    if (key.startsWith(__dirname + '/src')) {
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
  if (!config.options) config.options = cfg.options || parseOptions();
  if (!config.build_dir) config.build_dir = cfg.build_dir || '../../build';
  if (!config.libName) config.libName = cfg.libName || 'baked.js';
  if (!config.baked) config.baked = cfg.baked || require('../server');
}

var config = {
  options: undefined,
  build_dir: '../../build',
  libName: 'baked.js',
  baked: require('../server'),
};

/* tasks */

gulp.task('baked:init', function() {
  if (!initialized) {
    init();
  }
});

gulp.task('baked:generate:lib', ['baked:init'], function() {
  baked = ReloadBaked();
  gulp.src('src/browser.js')
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
  gulp.src(config.build_dir + '/' + config.libName).pipe(gulp.dest(config.options.dst_dir));
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
  gulp.watch('src/**/*.js', ['baked:generate']);
});

gulp.task('baked:watch:content', ['baked:init'], function () {
  gulp.watch(config.options.src_dir + '/**/*', ['baked:generate:content']);
});

gulp.task('baked:watch', ['baked:watch:src', 'baked:watch:content']);

/* default tasks */

gulp.task('baked:dev', ['baked:generate', 'baked:server', 'baked:watch']);
gulp.task('baked:default', ['baked:generate']);

/* exports */

exports.config = config;
exports.init = init;
exports.parseOptions = parseOptions;
exports.ReloadBaked = ReloadBaked;
