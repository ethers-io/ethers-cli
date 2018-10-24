'use strict';

var builders = require('./lib/builders');

module.exports = {
    builders: builders,
    Builder: builders.Builder,
    TestBuilder: builders.TestBuilder,

    compiler: require('./lib/compiler'),

    Slug: require('./lib/slug'),
    TestProvider: require('./lib/test-provider'),
}
