var http = require('http');

var gulp = require('gulp');
var browserify = require('gulp-browserify');
var concat = require('gulp-concat');
var watch = require('gulp-watch');

var ecstatic = require('ecstatic');

var baked = require('./src/server');

var src_dir = 'to_generate';
var dst_dir = 'generated';

gulp.task('generate:lib', function() {
  gulp.src('src/browser.js')
    .pipe(browserify({
      options: {
        alias: ['./src/fake:canvas']
      }
    }))
    .pipe(concat('baked.js'))
    .pipe(gulp.dest('./build'));
});

gulp.task('generate:content', function () {
  baked.generate(src_dir, dst_dir, {async: true, debug: false});
});

gulp.task('generate:all', function () {
  gulp.start('generate:lib');
  gulp.start('generate:content');
});

gulp.task('serve', function() {
  http.createServer(ecstatic({
    root: __dirname + '/' + dst_dir,
    baseDir: '/',
    cache: 1,
    showDir: false,
    autoIndex: true,
    defaultExt: 'html'
  })).listen(8282);
});

gulp.task('default', function () {
  gulp.start('generate:all');
  gulp.start('serve');
  gulp.watch('src/**/*.js', ['generate:all']);
  gulp.watch(src_dir + '/**/*', ['generate:content']);
});



