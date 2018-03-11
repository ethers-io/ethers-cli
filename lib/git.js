'use strict';

// This is largely similar (and copied) from git-command, except:
//   - The executor reads a buffer (so binary files work)
//   - ls-tree
//   - Multiple instances don't trounce the baseDir

var childproc = require('child_process');
var crypto = require('crypto');
var path = require('path');

var abs = require('abs');
var ethers = require('ethers');

function sha1(data) {
    if (!Buffer.isBuffer(data)) { throw new Error('invalid data'); }
    return crypto.createHash('sha1').update(data).digest('hex')
}

function getHash(data) {
    var header = new Buffer('blob ' + data.length + '\0');
    return sha1(Buffer.concat([header, data]));
}

function execute(root, args, parse) {
    return new Promise(function(resolve, reject) {
        var result = new Buffer(0);
        var stderr = new Buffer(0);
        var executor = childproc.spawn('git', args, {
            cwd: abs(root),
            encoding: 'buffer',
        });

        executor.stdout.on('data', function (data) {
            result = Buffer.concat([result, data]);
        });

        executor.stderr.on('data', function (data) {
            stderr = Buffer.concat([stderr, data]);
        });

        executor.on('close', function (code, signal) {
            if (code === 0) {
                if (parse) { result = parse(result); }
                resolve(result);
            } else {
                var error = new Error(stderr.toString().trim());
                error.code = code;
                reject(error);
            }
        });
    });
}

var Status = function(symbol) {
    var mapping = {
            '??': 'notAdded',
            'M': 'modified',
            'D': 'deleted',
            'A': 'created',
            'UU': 'conflicted',
            'AM': 'createdAndModified',
            'MM': 'stagedAndModified'
        },
        current = mapping[symbol];

    return function(files, result) {
        if(!result[current]){
            result[current] = [];
        }
        result[current].push(files);
    }
}

function statusParser(result) {
    result = result.toString();

    var lines = result.trim().split('\n');
    var line = '';
    var handler;
    var result = {};
    while (line = lines.shift()) {
        line = line.trim().match(/(\S+)\s+(.*)/);
        if(line && (handler = Status([line[1]]))) {
            handler(line[2], result);
        }
    }
    return result;
}

function parseListTree(input) {
    var result = {};
    input.toString().trim().split('\n').forEach(function(line) {
        var match = line.match(/^([0-9]+)([ \t]+)(blob)([  \t]+)([0-9a-fA-F]+)([ \t]+)(.*)$/);
        if (!match) {
            console.log('Weird: No match ' + line);
            return;
        }
        result[match[7]] = match[5];
    });
    return result;
}

function Git(root) {
    if (!(this instanceof Git)) { throw new Error('missing new'); }
    ethers.utils.defineProperty(this, 'path', root);
}

ethers.utils.defineProperty(Git.prototype, 'show', function(filename, revision) {
    if (!revision) { revision = 'HEAD'; }
    return execute(this.path, ['show', revision + ':' + filename]);
});

ethers.utils.defineProperty(Git.prototype, 'status', function() {
    return execute(this.path, ['status', '-s'], statusParser);
});

ethers.utils.defineProperty(Git.prototype, 'getHead', function() {
    return execute(this.path, ['rev-parse', 'HEAD'], function (input) {
        return input.toString().trim();
    });
});

ethers.utils.defineProperty(Git.prototype, 'listTree', function(revision) {
    if (!revision) { revision = 'HEAD'; }
    return execute(this.path, ['ls-tree', '-r', revision], parseListTree).catch(function(error) {
        if (error.code === 128 && error.message === 'fatal: Not a valid object name HEAD') {
            return {};
        }
        throw error;
    });
});

ethers.utils.defineProperty(Git.prototype, 'diff', function(a, b) {
    return execute(this.path, ['diff', a, b], function(result) { return result.toString(); } );
});

ethers.utils.defineProperty(Git, 'getHash', getHash);

module.exports = Git;
