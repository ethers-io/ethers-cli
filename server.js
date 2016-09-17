'use strict';

var http = require('http');
var urlParse = require('url').parse;

var awsSdk = require('aws-sdk');
var mimeTypes = require('mime-types');
var Wallet = require('ethers-wallet');

var Slug = require('./lib/slug.js');
var version = require('./package.json').version;

var utils = require('./lib/utils.js');
var version = require('./package.json').version;

function showHelp(error) {
    console.log('');
    console.log('Command Line Interface - ethers.space/' + version);
    console.log('');
    console.log('Usage');
    console.log('    node server.js [--help | --version | [ [--port PORT]');
    console.log('                  [--cache-ttl TTL] [--cache-size SIZE] ]');
    console.log('');
    console.log('        --help');
    console.log('        --version');
    console.log('');
    console.log('        --cache-ttl');
    console.log('        --cache-size');
    console.log('        --port');
    console.log('');

    if (error && error.message !== '') {
        console.log(error.message);
        console.log('');
        process.exit(1);
    }

    process.exit();
}



try {
    var opts = utils.getopts({
        'aws-config': 'credentials.json',
        'cache-size': 10,
        'cache-ttl': 60,
        'port': 8000,
    }, {
        help: false,
        version: false
    });

    if (opts.flags.help) { throw new Error(''); }

    if (opts.flags.version) {
        console.log('ethers.space/' + version);
        process.exit();
    }

    opts.ensureInteger('cache-size');
    opts.ensureInteger('cache-ttl');
    opts.ensureInteger('port');

    opts.ensureJSON('aws-config');

} catch (error) {
    showHelp(error);
}

var getSlug = (function() {

    var S3 = new awsSdk.S3({
        apiVersion: '2016-09-17',
        region: 'us-east-1',
        accessKeyId: opts.options['aws-config']['access-key-id'],
        secretAccessKey: opts.options['aws-config']['secret-access-key']
    });

    var cacheSize = opts.options['cache-size'];
    var cacheLifespan = opts.options['cache-ttl'] * 1000;
    var cache = {};

    function purge() {
        var keys = Object.keys(cache);
        if (keys.length <= cacheSize) { return; }

        // Remove any expired slugs
        var now = (new Date()).getTime();
        keys.forEach(function(key) {
            if ((now - cache[key].cacheDate) > cacheLifespan) {
                delete cache[key];
            }
        });

        // Get the current list of keys, sorted most recently used to oldest
        keys = Object.keys(cache);
        keys.sort(function(a, b) {
            return (a.lastUsedTime - b.lastUSedTime);
        });

        // Trim down to cacheSize, removing least recently used first
        while (keys.length > cacheSize) {
            delete cache[keys.pop()];
        }
    }

    function getSlug(address) {
        return new Promise(function(resolve, reject) {
            S3.getObject({
                Bucket: 'slugs.ethers.space',
                Key: (address + '.slug'),
            }, function(error, data) {

                // Error fetching the slug
                if (error) {
                    console.log(error);
                    reject(error);
                    return;
                }

                // Verify the slug's address and its signature
                try {
                    var content = data.Body.toString();
                    var data = JSON.parse(content);
                    if (data.address !== address) { throw new Error('address mismatch'); }
                } catch (error) {
                    console.log(error);
                    reject(error);
                    return;
                }

                try {
                    var slug = Slug.verify(content);
                } catch (error) {
                    reject(error);
                    return;
                }

                var now = (new Date()).getTime();
                cache[address] = {
                    slug: slug,
                    cacheTime: now,
                    lastUsedTime: now
                }

                purge();

                resolve(slug);
            });
        });
    }

    return function(address) {
        var now = (new Date()).getTime();
        var info = cache[address];
        if (info && (now - info.cacheTime) < cacheLifespan) {
            info.lastUsedTime = now;
            return new Promise(function(resolve, reject) {
                resolve(info.slug);
            });
        }
        return getSlug(address);
    }
})();

var server = http.createServer(function(request, response) {

    // Get the address
    var host = urlParse('http://' + request.headers.host + '/').hostname;
    try {
        var address = Wallet.getAddress(host.split('.')[0]);
    } catch (error) {
        response.writeHead(400, 'Unsupported Method', {});
        response.end();
        return;
    }

    // Get the path
    var path = request.url;
    if (path.substring(path.length - 1) === '/') { path += 'index.html'; }
    path = path.substring(1);

    // We only support GET (and HEAD)
    if (request.method === 'GET' || request.method === 'HEAD') {

        getSlug(address).then(function(slug) {

            // Has the content changed since any previous request?
            // See: https://tools.ietf.org/html/rfc7232#section-3.2
            var etag = '"sha256-' + slug.getHash(path) + '"';
            if (etag === request.headers['if-none-match']) {
                response.writeHead(304, 'Not Modified', {});
                response.end();
                return;
            }

            // Prepare the body and headers
            var body = slug.getData(path);
            var headers = {
                'Cache-Control': 'public',
                'Content-Length': body.length,
                'Server': 'ethers.space/' + version,
                'ETag': etag,
            }

            // Get the mime-type
            var contentType = mimeTypes.contentType(path);
            if (contentType) { headers['Content-Type'] = contentType; }

            // Send the response
            response.writeHead(200, 'OK', headers);

            // Only send a body for GET (not HEAD)
            if (request.method === 'GET') {
                response.end(body);
            } else {
                response.end();
            }
        }, function(error) {
            response.writeHead(500, 'Server Error', {});
            response.end();
        });

    } else {
        response.writeHead(400, 'Unsupported Method', {});
        response.end();
    }
});

server.listen(opts.options.port, function() {
    console.log('ethers.space running on port: ' + opts.options.port);
});
