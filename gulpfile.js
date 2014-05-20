var http = require('http');

var gulp = require('gulp');
var browserify = require('gulp-browserify');
var concat = require('gulp-concat');
var watch = require('gulp-watch');

var ecstatic = require('ecstatic');

var dst_dir = 'generated';

gulp.task('generate', function() {
  gulp.src('src/browser.js')
    .pipe(browserify({
      options: {
        alias: ['./src/fake:canvas']
      }
    }))
    .pipe(concat('baked.js'))
    .pipe(gulp.dest('./build'));
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
  gulp.start('generate');
  gulp.start('serve');
  gulp.watch('src/**/*.js', ['generate']);
});



