'use strict';

var fs = require('fs');
var http = require('http');
var https = require('https');
var urlParse = require('url').parse;

var mimeTypes = require('mime-types');
var pem = require('pem');

var utils = require('./utils.js');
var version = require('../package.json').version;

function WebServer(handler, options) {
    if (!(this instanceof WebServer)) { throw new Error('missing new'); }

    if (!options) { options = {}; }

    utils.defineProperty(this, 'handler', handler);
    utils.defineProperty(this, 'port', options.port || 8000);

    utils.defineProperty(this, '_overrides', {});
}

utils.defineProperty(WebServer.prototype, 'start', function(callback) {

    var self = this;

    function listener(request, response) {
        var url = urlParse(request.url);
        var path = url.path;
        if (path.substring(path.length - 1) === '/') { path += 'index.html'; }

        // Get the content as a promise
        var content = self._overrides[path];
        if (content && !(content instanceof Promise)) {
            if (typeof(content) === 'string') {
                content = Promise.resolve({path: 'OVERRIDE:' + path, body: content});
            } else if (content instanceof Error) {
                content = Promise.reject(content);
            } else {
                content = Promise.reject(WebServer.makeError(500, 'Server Error'));
            }
        } else {
            content = self.handler(path);
        }

        content.then(function(result) {
            var path = result.path;
            var body = (result.body || '');

            var headers = {
                'content-length': String(body.length),
                'server': 'ethers-cli/' + version,
                'connection': 'close',
            };

            var filename = path.split('/');
            filename = filename[filename.length - 1];
            var contentType = result.contentType;
            if (!contentType) { contentType = mimeTypes.contentType(filename); }
            if (contentType) { headers['content-type'] = contentType; }

            console.log('OK: ' + request.url + ' => ' + path + ' (' + body.length + ' bytes)');
            response.writeHead(200, 'OK', headers);
            if (request.method === 'HEAD') {
                response.end()
            } else {
                response.end(body)
            }

        }, function(error) {
            console.log(error);

            var statusCode = (error.errorCode  || 500);
            console.log('Error: ' + request.url + ' (' + statusCode + ')');
            response.writeHead(statusCode, error.message);
            response.end();
        });
    }

    var server = http.createServer(listener);
    server.listen(this.port, '127.0.0.1', function() {
        if (callback) { callback(); }
    });

/*
    function serverHTTPS(keys) {
        var server = https.createServer({
            key: keys.serviceKey,
            cert: keys.certificate
        }, listener);

        serve(server);
    }

    function serveHTTP() {
        serve(http.createServer(listener));
    }
    */
});

utils.defineProperty(WebServer.prototype, 'addOverride', function(path, content) {
    this._overrides[path] = content;
});

utils.defineProperty(WebServer, 'staticFileHandler', function(rootPath) {
    if (!rootPath) { rootPath = process.cwd(); }

    console.log('Serving content from file://' + rootPath);

    return function(path) {
        path = rootPath + path;
        return new Promise(function(resolve, reject) {
            fs.realpath(path, function(error, path) {
                if (error) {

                    // File not found..
                    if (error.code === 'ENOENT') {
                        reject(WebServer.makeError(404, 'Not Found'));
                        return;
                    }

                    // Something else?
                    reject(WebServer.makeError(500, 'Server Error'));
                    return;
                }

                // Make sure we aren't following any relative paths outside
                if (path.substring(0, rootPath.length) !== rootPath) {
                    reject(WebServer.makeError(403, 'Forbidden'));
                    return;
                }

                // Read the file
                fs.readFile(path, function(error, data) {

                    // Permission error
                    if (error) {
                        reject(WebServer.makeError(403, 'Forbidden'));
                        return;
                    }

                    // Send the result
                    resolve({
                        path: ('.' + path.substring(rootPath.length)),
                        body: data,
                    });
                });
            });
        });
    }
});
/*
utils.defineProperty(Server, 'createServer', function(handler) {
    if (!handler) { handler = Server.StaticFileHandler(); }
    return new Server(handler);
});
*/

utils.defineProperty(WebServer, 'makeError', function(statusCode, message) {
    var error = new Error(message);
    error.statusCode = statusCode;
    return error;
});

/*
utils.defineProperty(Server, 'CreateSecureServer', function(filename, handler) {
    if (!filename) { filename = '.ethers-self-signed.pem'; }
    if (!handler) { handler = Server.StaticFileHandler(); }
    
});
*/
module.exports = WebServer;
