module.exports = function(grunt) {

  var pkg = grunt.file.readJSON('package.json');

  grunt.initConfig({

    VERSION: pkg.version,
    pkg: pkg

  });

  // Default task.
  grunt.registerTask('default', []);

};
