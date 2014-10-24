// Loads the main gulp library
var gulp = require('gulp');
// Loads the baked.js's tasks
var baked = require('baked/gulp');
// Libraries used in this file
var stylus = require('gulp-stylus');
var watch = require('gulp-watch');

// Load and get the baked configuration
// in order to use srcDir and dstDir
var config = baked.init();

// This example uses its specific package.json file so its gulp instance seems
// to be distinct than the baked's one. This helper allows to load every tasks
// in the right gulp environment.
baked.defineTasks(gulp);

var paths = {
  stylus: {
    src: config.options.srcDir + '/**/*.styl',
    dst: config.options.dstDir
  }
};

// Get and render all .styl files recursively
gulp.task('stylus', function () {
  gulp.src(paths.stylus.src)
    .pipe(stylus())
    .pipe(gulp.dest(paths.stylus.dst));
});
// More informations on https://www.npmjs.org/package/gulp-stylus

gulp.task('watch:stylus', function () {
  gulp.watch(paths.stylus.src, ['stylus']);
});

// Defaults tasks
gulp.task('serve', ['stylus', 'watch:stylus', 'baked:serve']);
gulp.task('default', ['stylus', 'baked:default']);
