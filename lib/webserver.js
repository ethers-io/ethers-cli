'use strict';

var fs = require('fs');
var http = require('http');
var pathlib = require('path');
var urlParse = require('url').parse;

var mimeTypes = require('mime-types');

var version = require('../package.json').version;

function WebServer(handler, options) {
    if (!(this instanceof WebServer)) { throw new Error('missing new'); }

    if (!options) { options = {}; }

    this.handler = handler;
    this.port = (options.port || 8000);
    this.host = (options.host || '127.0.0.1');

    this._overrides = {};
}

WebServer.prototype.start = function(callback) {

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
            var statusCode = (error.statusCode  || 500);
            var tag = 'Error';
            if (statusCode >= 300 && statusCode < 400) { tag = 'Action'; }
            console.log(tag + ': ' + request.url + ' (' + statusCode + ': ' + JSON.stringify(error.headers) + ')');
            response.writeHead(statusCode, error.message, error.headers);
            response.end();
        });
    }

    var server = http.createServer(listener);
    server.listen(this.port, this.host, function() {
        if (callback) { callback(); }
    });
}

WebServer.prototype.addOverride = function(path, content) {
    this._overrides[path] = content;
}

WebServer.staticFileHandler = function(rootPath) {
    if (!rootPath) { rootPath = process.cwd(); }

    console.log('Serving content from file://' + rootPath);

    var fetch = function(path) {
        var fullpath = rootPath + path;
        return new Promise(function(resolve, reject) {
            fs.realpath(fullpath, function(error, fullpath) {
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
                if (fullpath.substring(0, rootPath.length) !== rootPath) {
                    reject(WebServer.makeError(403, 'Forbidden'));
                    return;
                }

                fs.stat(fullpath, function(error, stat) {
                    if (stat.isDirectory()) {
                        reject(WebServer.makeError(302, 'Moved Temporarily', { Location: path + '/' }));
                        return;
                    }

                    // Read the file
                    fs.readFile(fullpath, function(error, data) {

                        // Permission error
                        if (error) {
                            reject(WebServer.makeError(403, 'Forbidden'));
                            return;
                        }

                        // Send the result
                        resolve({
                            path: ('.' + fullpath.substring(rootPath.length)),
                            body: data,
                        });
                    });
                });
            });
        });
    };

    return fetch;
}

/*
utils.defineProperty(Server, 'createServer', function(handler) {
    if (!handler) { handler = Server.StaticFileHandler(); }
    return new Server(handler);
});
*/

WebServer.makeError = function(statusCode, message, headers) {
    var error = new Error(message);
    error.statusCode = statusCode;
    error.headers = headers || {};
    return error;
}

/*
utils.defineProperty(Server, 'CreateSecureServer', function(filename, handler) {
    if (!filename) { filename = '.ethers-self-signed.pem'; }
    if (!handler) { handler = Server.StaticFileHandler(); }
    
});
*/
module.exports = WebServer;
