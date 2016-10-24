'use strict';

// This is largely similar (and copied) from git-command, except:
//   - The executor reads a buffer (so binary files work)
//   - ls-tree
//   - Multiple instances don't trounce the baseDir

var abs = require('abs');
var childproc = require('child_process');

var utils = require('./utils.js');

function execute(path, args, parse) {
    return new Promise(function(resolve, reject) {
        var result = new Buffer(0);
        var executor = childproc.spawn('git', args, {
            cwd: abs(path),
            encoding: 'buffer',
        });

        executor.stdout.on('data', function (data) {
            result = Buffer.concat([result, data]);
        });

        executor.stderr.on('data', function (data) {
            console.log('Error: ', data);
        });

        executor.on('close', function (code, signal) {
            if (code === 0) {
                if (parse) { result = parse(result); }
                resolve(result);
            } else {
                reject(new Error(code));
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

function parseListTree(result) {
    return result.toString().trim().split('\n');
}

function Git(path) {
    if (!(this instanceof Git)) { throw new Error('missing new'); }
    utils.defineProperty(this, 'path', path);
}

utils.defineProperty(Git.prototype, 'show', function(filename, revision) {
    if (!revision) { revision = 'HEAD'; }
    return execute(this.path, ['show', revision + ':' + filename]);
});

utils.defineProperty(Git.prototype, 'status', function() {
    return execute(this.path, ['status', '-s'], statusParser);
});

utils.defineProperty(Git.prototype, 'listTree', function(revision) {
    if (!revision) { revision = 'HEAD'; }
    return execute(this.path, ['ls-tree', '-r', revision, '--name-only'], parseListTree);
});

module.exports = Git;
