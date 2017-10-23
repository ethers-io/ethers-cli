'use strict';

/**
 *  Slug
 *
 *  A slug is an entire deployment.
 *  The internal structure of a payload is a JSON object with:
 *    - contents: a list of filecontents, hex encoded
 *    - filenames: a map of (string:filename => string:contentHash) (mapping should be sorted)
 *
 *  This payload is then gzipped and base64 encoded.
 *
 *  This is then wrapped in another JSON object (optionally signed):
 *    - address: the address that signed this slug
 *    - signature: the signature of the slug for the given address
 *    - payload: the above internal structure
 *
 *  Note: Hex encodings are used on the internal structure since they compress better,
 *        but base64 is used on the external structure since it is smaller.
 */

var crypto = require('crypto');
var fs = require('fs');
var zlib = require('zlib');

var ethers = require('ethers');

var Git = require('./git.js');


/**
 *  Slug()
 */

function Slug() {
    if (!(this instanceof Slug)) { throw new Error('missing new'); }

    var contents = {};
    var filenames = {};
    var gitHashes = {};

    ethers.utils.defineProperty(this, 'addData', function(filename, data) {
        if (typeof(filename) !== 'string') { throw new Error('invalid filename'); }
        if (!Buffer.isBuffer(data)) { throw new Error('invalid data'); }
        var contentHash = ethers.utils.sha256(data);
        contents[contentHash] = new Buffer(data);
        gitHashes[contentHash] = Git.getHash(data);
        filenames[filename] = contentHash;
    });

    ethers.utils.defineProperty(this, 'getData', function(filename) {
        var contentHash = filenames[filename];
        if (!contentHash) { return null; }
        var content = contents[contentHash];
        if (!content) { return null; }
        return new Buffer(content);
    });

    ethers.utils.defineProperty(this, 'getGitHash', function(filename) {
        var contentHash = filenames[filename];
        if (!contentHash) { return null; }
        return gitHashes[contentHash];
    });

    ethers.utils.defineProperty(this, 'getHash', function(filename) {
        var contentHash = filenames[filename];
        return contentHash;
    });

    Object.defineProperty(this, 'filenames', {
        enumerable: true,
        get: function() {
            var result = Object.keys(filenames);
            result.sort();
            return result;
        }
    });

    Object.defineProperty(this, 'json', {
        enumerable: true,
        get: function() {
            var result = {
                contents: {},
                filenames: {},
                gitHashes: {},
                salt: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
                version: 2
            };
            var contentHashes = Object.keys(contents);
            contentHashes.sort();
            contentHashes.forEach(function(contentHash) {
                result.contents[contentHash] = contents[contentHash].toString('hex');
                result.gitHashes[contentHash] = gitHashes[contentHash];
            });
            this.filenames.forEach(function(filename) {
                result.filenames[filename] = filenames[filename];
            });
            return JSON.stringify(result);
        }
    });

    Object.defineProperty(this, 'payload', {
        enumerable: true,
        get: function() {
            return zlib.deflateSync(this.json).toString('base64');
        }
    });

    ethers.utils.defineProperty(this, 'sign', function(privateKey) {
        var wallet = new ethers.Wallet(privateKey);

        var payload = this.payload;
        var payloadHash = ethers.utils.sha256(new Buffer(payload, 'base64'));

        var signedPayload = {
            address: wallet.address,
            payload: payload,
            signature: wallet.sign({data: payloadHash}),
            version: 2
        }

        return JSON.stringify(signedPayload);
    });

    ethers.utils.defineProperty(this, 'unsigned', function() {
        var signedPayload = {
            address: '',
            payload: this.payload,
            signature: '',
            version: 2
        }

        return JSON.stringify(signedPayload);
    });
}

function parsePayload(payload) {
    var data = JSON.parse(zlib.inflateSync(new Buffer(payload, 'base64')).toString());
    if (data.version !== 2) { throw new Error('unsupported Slug version'); }
    if (!data.contents || !data.filenames) {
        throw new Error('invalid Slug');
    }

    var result = new Slug();
    for (var filename in data.filenames) {
        var contentHash = data.filenames[filename];
        var content = data.contents[contentHash];
        if (!contentHash) { throw new Error('missing content'); }
        result.addData(filename, new Buffer(content, 'hex'));
    }
    return result;
};

function verify(json, allowUnsigned) {
    var data = JSON.parse(json);
    if (data.version !== 2) { throw new Error('unsupported version'); }

    var payloadHash = ethers.utils.sha256(new Buffer(data.payload, 'base64'));

    if (data.signature) {
        var transaction = ethers.Wallet.parseTransaction(data.signature);
        if (payloadHash !== transaction.data || data.address !== transaction.from) {
            throw new Error('invalid signature');
        }
    } else if (!allowUnsigned) {
        throw new Error('unsigned slug');
    }

    return parsePayload(data.payload);
}

function load(json) {
    var data = JSON.parse(json);

    var result = null;
    try {
        result = verify(json);
        ethers.utils.defineProperty(result, 'signed', data.address)
    } catch (error) {
        result = parsePayload(data.payload);
        ethers.utils.defineProperty(result, 'signed', '')
    }

    return result;
}

// @TODO: use path
/*
var listFiles = (function() {
    return function(path) {
        return new Promise(function(resolve, reject) {
            if (path) { GitRunner.baseDir = path; }
            return GitRunner.execute(['git', 'ls-tree', '-r', 'HEAD', '--name-only'], function(result) {
                resolve(result.trim().split('\n'));
            });
        });
    }
})();
*/
function generate(path) {
    var git = new Git('.');

    function listStatus() {
        return git.status().then(function(result) {
            var status = {};
            for (var type in result) {
                result[type].forEach(function(filename) {
                    status[filename] = type;
                });
            }
            return status;
        });
    }

    function padding(length) {
        var padding = '';
        while (padding.length < length) { padding += ' '; }
        return padding;
    }

    return new Promise(function(resolve, reject) {
        var slug = new Slug();

        function addFile(filename) {
            return git.show(filename).then(function(data) {
                slug.addData(filename, data);
            });
        }

        Promise.all([
            listStatus(),
            git.listTree(),
        ]).then(function(results) {
            var status = results[0];
            var filenames = Object.keys(results[1]);

            var warnings = [];
            function addWarning(filename, message) {
                if (message) {
                    filename = filename + padding(30 - filename.length);
                    message = ' ' + message;
                } else {
                    filename = '';
                }
                warnings.push(filename + message);
            }

            // Promises to read files
            var readFiles = [];

            // Include warnings for files that are untracked
            for (var filename in status) {
                if (status[filename] !== 'notAdded') {
                    if (filename === 'account.json') {
                        addWarning(filename, '(skipping secure file; will not be published)');
                    }
                    continue;
                }

                if (filename === '.ethers-self-signed.pem') { continue; }
                if (filename === 'account.json') { continue; }
                if (filename.substring(filename.length - 5) === '.slug') { continue; }
                addWarning(filename, '(untracked file; will not be published)');
            }

            // prepare files to include
            if (filenames.length) {
                console.log('Adding:');

                filenames.forEach(function(filename) {
                    if (filename === '.ethers-self-signed.pem') { return; }
                    if (filename === 'account.json') { return; }

                    // Read the file
                    readFiles.push(addFile(filename));

                    // Prepare any warnings for this filename
                    switch (status[filename]) {
                        case 'deleted':
                            addWarning(filename, '(file deleted in stage only; will still be published)');
                            break;
                        case 'modified':
                            addWarning(filename, '(file modified in stage; changes will NOT be published)');
                            break;
                        case undefined:
                            break
                        default:
                            console.log('ERROR', filename, status[filename]);
                            throw new Error('Unhandled status: ' + status[filename]);
                    }

                    console.log('    ' + filename);
                });

                Promise.all(readFiles).then(function(results) {
                    resolve(slug);
                }, function(error) {
                    reject(error);
                });

            } else {
                addWarning('no files found')
                reject(new Error('no files found'));
            }

            // There were problems
            if (warnings.length) {
                console.log('WARNING!');
                warnings.forEach(function(warning) {
                    console.log('    ' + warning);
                });
            }

        }, function(error) {
            reject(error);
        });
    });
}

/*
Slug.prototype.encode = function(privateKey) {
    var filenames = this.filenames;
    filenames.sort();

    var slugData = {};
    filenames.forEach(function(filename) {
        var data = this.getData(filename);
        slugData[filename] = {
            content: data.toString('base64'),
            hash: sha256(data)
        }
    });

    var payload = JSON.stringify({
        files: slugData,
        signature: zeros,
        version: '0.0.1',
    })

    if (privateKey) {
        var signature = zeros;
        payload = JSON.stringify({
            files: slugData,
            signature: signature,
            version: '0.0.1',
        });
    }

    var slug = zlib.deflateSync(payload);

    console.log('Slug size (uncompressed): ' + payload.length);
    console.log('Slug size (compressed): ' + slug.length);

    return slug;
}

Slug.decode(data) {
}
*/

module.exports = {
    generate: generate,
    parsePayload: parsePayload,
    load: load,
    verify: verify,
}
