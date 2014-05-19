module.exports = function(grunt) {

  var pkg = grunt.file.readJSON('package.json');

  grunt.initConfig({

    VERSION: pkg.version,
    pkg: pkg,

    browserify: {
      dist: {
        files: {
          'build/<%= pkg.name %>.js': ['src/router.js', 'src/baked.js', 'src/browser.js'],
        },
        options: {
          alias: ['./src/fake:canvas']
        }
      }
    },

    'http-server': {
      dev: {
        // the server root directory
        root: 'generated',
        port: 8282,
        host: "127.0.0.1",
        cache: -1,
        showDir : true,
        autoIndex: true,
        defaultExt: "html",
        // run in parallel with other tasks
        runInBackground: false
      }
    }

  });

  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-http-server');

  // Default task.
  grunt.registerTask('default', ['browserify', 'http-server:dev']);

};
