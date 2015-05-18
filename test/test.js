'use test';

var should = require('should');
var fs = require('fs');
var baked = require('../src/server');


// TODO: Mock the server
var API_ENDPOINT = 'https://lesbonneschoses-ulzozro531ca879z.prismic.io/api';


function testLogger(name) {
  // Store log messages in an array
  this.messages = {info: [], error: [], debug: []};
  for (l in this.messages) {
    this[l] = this.messages[l].push.bind(this.messages[l]);
  }
  return this;
}

describe('baked', function() {
  it('should render correctly', function(done) {
    var ctx = {
      srcDir: './test/render/src',
      dstDir: './test/render/dst',
      api: API_ENDPOINT,
      urlBase: 'http://localhost/',
      logger: new testLogger('render')
    };
    baked.generate(ctx).done(function (failures) {
      should(failures).have.length(0);
      should(ctx.logger.messages.error).have.length(0);

      var content = fs.readFileSync(ctx.dstDir + '/index.html');

      should(String(content)).containEql(ctx.urlBase);
      should(String(content)).containEql('<title>TEST</title>');
      should(String(content)).containEql('Tsutomu Kabayashi');

      done();
    });
  });
});
