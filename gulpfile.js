/*
 * /!\ WARNING /!\
 *
 * This file is the internal gulp configuration file,
 * it is _not_ an example of gulpfile.js you can use.
 *
 * The base gulpfile.js provided by baked.js is: gulp.js
 * Examples of gulpfile.js can be found in examples
 *
 * /!\ WARNING /!\
 */

var browserify = require('gulp-browserify');
var concat = require('gulp-concat');
var gulp = require('gulp');
var watch = require('gulp-watch');

var config = {
  libName: 'baked.js',
  buildDir: 'build'
};

// Builds the browser-oriented library of baked.js
// (to be used by generated sources to achieve dynamic generation)
gulp.task('build', function() {
  return gulp.src('./src/browser.js')
    .pipe(browserify({
      options: {
        alias: ['../fake:canvas']
      }
    }))
    .pipe(concat(config.libName))
    .pipe(gulp.dest(config.buildDir));
});

gulp.task('watch', ['build'], function () {
  gulp.watch('./src/**/*.js', ['build']);
});

gulp.task('default', ['build']);
