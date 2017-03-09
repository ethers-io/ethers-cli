var crypto = require('crypto');
var fs = require('fs');
var http = require('http');
var https = require('https');
var urlParse = require('url').parse;

function defineProperty(object, name, value) {
    Object.defineProperty(object, name, {
        enumerable: true,
        configurable: false,
        value: value,
        writable: false
    });
}

function sha256(data) {
    if (!Buffer.isBuffer(data)) { throw new Error('invalid data'); }
    return crypto.createHash('sha256').update(data).digest('hex')
}

function sha1(data) {
    if (!Buffer.isBuffer(data)) { throw new Error('invalid data'); }
    return crypto.createHash('sha1').update(data).digest('hex')
}

function getGitHash(data) {
    var header = new Buffer('blob ' + data.length + '\0');
    return sha1(Buffer.concat([header, data]));
}


function getopts(options, flags, argv) {
    if (!argv) { argv = process.argv.slice(2); }

    var args = [];
    var explicit = [];

    for (var i = 0; i < argv.length; i++) {
        var param = argv[i];
        if (param.substring(0, 2) !== '--') {
            args.push(param);
            continue;
        }
        var key = param.substring(2);

        if (flags[key] === false) {
            explicit.push('--' + key);
            flags[key] = true;
            continue;
        }

        if (options[key] == undefined) {
            throw new Error('unknown option: ' + key);
        }
        explicit.push('--' + key);

        var value = argv[++i];
        if (value === undefined) {
            throw new Error('missing value for option: ' + key);
        }

        if (options[key].push) {
            options[key].push(value);

        } else {
            options[key] = value;
        }
    }

    function ensureFile(key) {
        try {
            if (Array.isArray(options[key])) {
                var contents = [];
                options[key].forEach(function(filename) {
                    contents.push(fs.readFileSync(filename));
                });
                options[key] = contents;
            } else {
                options[key] = fs.readFileSync(options[key]);
            }
        } catch (error) {
            throw error;
        }
    }

    function ensureInteger(key, minValue, maxValue) {
        var value = options[key];
        if (parseInt(value) != value) { throw new Error(key + ' must be an integer'); }
        value = parseInt(value);

        if (typeof(minValue) === 'number' && minValue > value) {
            throw new Error(key + ' must be ' + minValue + ' or greater');
        } else if (typeof(maxValue) === 'number' && maxValue < value) {
            throw new Error(key + ' must be ' + maxValue + ' or less');
        }

        options[key] = value;
    }

    function ensureJSON(key) {
        try {
            options[key] = JSON.parse(fs.readFileSync(options[key]));
        } catch (error) {
            throw new Error(key + ' must be a valid JSON filename');
        }
    }

    return {
        args: args,
        explicit: explicit,
        flags: flags,
        options: options,

        ensureFile: ensureFile,
        ensureInteger: ensureInteger,
        ensureJSON: ensureJSON,
    }
}


var urlApi = 'https://api.ethers.io/api/v1/';
//var urlApi = 'http://localhost:5000/api/v1/';

// @TODO: Include a timestamp (or nonce of some sort) in uploads

function fetchUrl(url, data) {
    var options = urlParse(url);
    if (data) {
        options.method = 'POST';
        options.headers = {'content-length': String(data.length)};
    } else {
        options.method = 'GET';
    }

    return new Promise(function(resolve, reject) {
        var request = ((options.protocol === 'https:') ? https: http).request(options, function(response) {
            var data = new Buffer(0);

            response.on('data', function(chunk) {
                data = Buffer.concat([data, chunk]);
            });

            response.on('end', function() {
                try {
                    resolve(data);
                } catch (error) {
                    reject(new Error('invalid response'));
                }
            });

            response.on('error', function(error) {
                reject(error);
            });
        });

        if (data) { request.write(data); }
        request.end();
    });
}

/*
fetchUrl('https://ethers.io').then(function(html) {
    console.log(html.toString());
}, function(error) {
    console.log(error);
});
*/

module.exports = {
    defineProperty: defineProperty,
    fetchUrl: fetchUrl,
    getGitHash: getGitHash,
    getopts: getopts,
    sha1: sha1,
    sha256: sha256,
}
