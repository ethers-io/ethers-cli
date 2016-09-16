var crypto = require('crypto');

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

function getopts(options, flags, argv) {
    if (!argv) { argv = process.argv.slice(2); }

    var args = [];

    for (var i = 0; i < argv.length; i++) {
        var param = argv[i];
        if (param.substring(0, 2) !== '--') {
            args.push(param);
            continue;
        }
        var key = param.substring(2);

        if (flags[key] === false) {
            flags[key] = true;
            continue;
        }

        if (options[key] == undefined) {
            throw new Error('unknown option: ' + key);
        }

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

    return {
        args: args,
        flags: flags,
        options: options,

        ensureInteger: ensureInteger,
    }
}

module.exports = {
    defineProperty: defineProperty,
    getopts: getopts,
    sha256: sha256,
}
