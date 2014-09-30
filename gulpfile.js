// Loads the main gulp library
var gulp = require('gulp');
// Loads the baked.js's tasks
var baked = require('./src/tasks/gulp');

// Defaults tasks (you are free to change them)
gulp.task('serve', ['baked:serve']);
gulp.task('default', ['baked:default']);
gulp.task('clean', ['baked:clean']);

// You can define your own custom tasks
//
//     gulp.task('deploy', ['baked:generate'], function () {
//       pleaseDeployMyContent(baked.config.options.dstDir);
//     });


// You can configure baked.js directly
//
//     baked.init({
//       options: {
//         srcDir: 'to_generate',
//         dstDir: 'generated'
//       },
//       libName: 'baked.js'
//     });

// These functions will be called after the generation
// (and after each generation trigged in dev mode)
//
//     baked.config.beforeGenerate = function () {
//       console.log("Attention c'est chaud !");
//     };
//
//     baked.config.afterGenerate = function (res) {
//       console.log("C'est prêt !");
//     };
