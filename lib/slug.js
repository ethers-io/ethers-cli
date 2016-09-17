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

var fs = require('fs');
var zlib = require('zlib');

var Wallet = require('ethers-wallet');

var utils = require('./utils.js');

/**
 *  Slug()
 */

function Slug() {
    if (!(this instanceof Slug)) { throw new Error('missing new'); }

    var contents = {};
    var filenames = {};

    utils.defineProperty(this, 'addData', function(filename, data) {
        if (typeof(filename) !== 'string') { throw new Error('invalid filename'); }
        if (!Buffer.isBuffer(data)) { throw new Error('invalid data'); }
        var contentHash = utils.sha256(data);
        contents[contentHash] = new Buffer(data);
        filenames[filename] = contentHash;
    });

    utils.defineProperty(this, 'getData', function(filename) {
        var contentHash = filenames[filename];
        if (!contentHash) { return null; }
        var content = contents[contentHash];
        if (!content) { return null; }
        return new Buffer(content);
    });

    utils.defineProperty(this, 'getHash', function(filename) {
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
            var result = {contents: {}, filenames: {}, version: 1};
            var contentHashes = Object.keys(contents);
            contentHashes.sort();
            contentHashes.forEach(function(contentHash) {
                result.contents[contentHash] = contents[contentHash].toString('hex');
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

    utils.defineProperty(this, 'sign', function(privateKey) {
        var wallet = new Wallet(privateKey);

        var payload = this.payload;
        var payloadHash = '0x' + utils.sha256(new Buffer(payload, 'base64'));

        var signedPayload = {
            address: wallet.address,
            payload: payload,
            signature: wallet.sign({data: payloadHash}),
            version: 1
        }

        return JSON.stringify(signedPayload);
    });
}

function parsePayload(payload) {
    var data = JSON.parse(zlib.inflateSync(new Buffer(payload, 'base64')).toString());
    if (data.version !== 1) { throw new Error('unsupported Slug version'); }
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

function verify(json) {
    var data = JSON.parse(json);

    if (data.version !== 1) { throw new Error('unsupported version'); }

    var payloadHash = '0x' + utils.sha256(new Buffer(data.payload, 'base64'));
    var transaction = Wallet.parseTransaction(data.signature);
    if (payloadHash !== '0x' + transaction.data.toString('hex') || data.address !== transaction.from) {
        throw new Error('invalid signature');
    }

    return parsePayload(data.payload);
}


// @TODO: use path
var listFiles = (function() {
    var runner = require('../node_modules/git-command/src/runner.js');
    return function(path) {
        return new Promise(function(resolve, reject) {
            if (path) { runner.baseDir = path; }
            return runner.execute(['git', 'ls-tree', '-r', 'HEAD', '--name-only'], function(result) {
                resolve(result.trim().split('\n'));
            });
        });
    }
})();

function generate(path) {
    return new Promise(function(resolve, reject) {
        var slug = new Slug();
        listFiles(path).then(function(filenames) {
            var slug = new Slug();
            filenames.forEach(function(filename) {
                try {
                    var data = fs.readFileSync(filename);
                    slug.addData(filename, data);
                } catch (error) {
                    console.log(error);
                    reject(error);
                    throw error;
                }
            });
            resolve(slug);
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
    verify: verify,
}
