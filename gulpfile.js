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

var path = require('path');

var browserify = require('gulp-browserify');
var concat = require('gulp-concat');
var gulp = require('gulp');
var watch = require('gulp-watch');
var uglify = require('gulp-uglify');
var mocha = require('gulp-mocha');

var config = {
  libName: 'baked.js',
  libMinName: 'baked.min.js',
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

gulp.task('test', function () {
  return gulp.src('./test/*.js')
    .pipe(mocha({reporter: 'dot'}));
});

gulp.task('compress', ['build'], function() {
  return gulp.src(path.join(config.buildDir, config.libName))
    .pipe(uglify())
    .pipe(concat(config.libMinName))
    .pipe(gulp.dest(config.buildDir))
});

gulp.task('watch', ['compress'], function () {
  gulp.watch('./src/**/*.js', ['compress']);
});

gulp.task('default', ['compress']);
