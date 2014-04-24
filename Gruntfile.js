module.exports = function(grunt) {

  var pkg = grunt.file.readJSON('package.json');

  grunt.initConfig({

    VERSION: pkg.version,
    pkg: pkg,

    browserify: {
      dist: {
        files: {
          'build/<%= pkg.name %>.js': ['src/dorian.js', 'src/browser.js'],
        },
        options: {
          alias: ['./src/fake:canvas', './src/dorian:dorian']
        }
      }
    }

  });

  grunt.loadNpmTasks('grunt-browserify');

  // Default task.
  grunt.registerTask('default', []);

};
