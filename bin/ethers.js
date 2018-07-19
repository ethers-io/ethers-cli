#!/usr/bin/env node

'use strict';

var fs = require('fs');
var path = require('path');
var inspect = require('util').inspect;

var ethers = require('ethers');

var builders = require('../lib/builders');
var compiler = require('../lib/compiler');
var getopts = require('../lib/getopts');

var REPL = require('repl');

var version = require('../package.json').version;

function padHex(data) {
    if (!data.match(/^(0x)?[0-9A-Fa-f]*$/)) {
        return null;
    }
    if (data.substring(0, 2) !== '0x') { data = '0x' + data; }

    if (data.length % 2) {
        data = '0x0' + data.substring(2);
    }

    return data;
}

function normalize(data, options) {
    if (options.hex && options.utf8) {
        throw new Error('cannot specify --hex and --utf8');
    }

    var kind = null;

    if (options.hex) {
        data = padHex(data);
        if (!data) { throw new Error('invalid hex data'); }
        kind = 'hex';
    } else if (options.utf8) {
        data = ethers.utils.toUtf8Bytes(data);
        kind = 'utf8'
    } else {
        var hexData = padHex(data);
        if (hexData) {
            data = hexData;
            kind = 'hex';
        } else {
            data = ethers.utils.toUtf8Bytes(data);
            kind = 'utf8'
        }
    }

    return {
        data: data,
        kind: kind
    }
}

var options = {
    help: false,
    version: false,

//    address: getopts.Address(),

    hex: false,
    utf8: false,

    sandbox: false,

    _accounts: true,
    _provider: true,
    _promises: true,
};

function doSandbox(opts) {
    var provider = opts.provider;
    var accounts = opts.accounts;
    var prompt = 'sanbox';

    if (opts.options.sandbox) {
        var builder = new builders.TestBuilder();
        provider = builder.provider;
        accounts = builder.accounts;
    } else {
        prompt = provider.name;
    }

    //var inputStream = new PauseStream(process.stdin);

    var repl = REPL.start({
        input: process.stdin,
        output: process.stdout,
        prompt: prompt + '> '
    });

    repl.input = repl.inputStream;

    function pause() {
        //repl.pause();
    }

    function resume() {
        //repl.resume();
    }

    var defaultEval = repl.eval.bind(repl);
    repl.eval = function(cmd, context, filename, cb) {
        var processResult = function(error, result) {
            if (result instanceof Promise) {
                if (result._forceWait) {
                    pause();
                    result.then(function(result) {
                        resume();
                        cb(null, result);
                    }, function(error) {
                        resume();
                        cb(error);
                    });
                    return;
                }

                repl.context._p = result;

                var timer = setTimeout(function() {
                    console.log(inspect(result));
                    timer = null;
                }, 500);

                result.then(function(result) {
                    if (timer) {
                        clearTimeout(timer);
                        console.log('Resolved:');
                    }
                    repl.context._p = result;
                    cb(null, result);

                }, function(error) {
                    if (timer) {
                        clearTimeout(timer);
                        console.log('Rejected:');
                    }
                    repl.context._p = error;
                    cb(error);
                });

            } else {
                cb(error, result);
            }
        };

        try {
            defaultEval(cmd, context, filename, processResult);
        } catch (error) {
            console.log('FOBAR');
            cb(error);
        }
    }

    // @TODO: Make these read-only

    repl.context.provider = provider;
    repl.context.accounts = accounts;
    repl.context.compile = compiler.compile.bind(builder);

    repl.context.ethers = ethers;
    repl.context.Contract = ethers.Contract;
    repl.context.Interface = ethers.Interface;
    repl.context.Wallet = ethers.Wallet;

    repl.context.providers = ethers.providers;

    repl.context.utils = ethers.utils;

    repl.context.abiCoder = ethers.utils.AbiCoder.defaultCoder;
    repl.context.BN = ethers.utils.bigNumberify;
    repl.context.bigNumberify = ethers.utils.bigNumberify;
    repl.context.formatEther = ethers.utils.formatEther;
    repl.context.formatUnits = ethers.utils.formatUnits;
    repl.context.getAddress = ethers.utils.getAddress;
    repl.context.getContractAddress = ethers.utils.getContractAddress;
    repl.context.hexlify = ethers.utils.hexlify;
    repl.context.id = ethers.utils.id;
    repl.context.keccak256 = ethers.utils.keccak256;
    repl.context.namehash = ethers.utils.namehash;
    repl.context.parseEther = ethers.utils.parseEther;
    repl.context.parseUnits = ethers.utils.parseUnits;
    repl.context.randomBytes = ethers.utils.randomBytes;
    repl.context.sha256 = ethers.utils.sha256;
    repl.context.toUtf8Bytes = ethers.utils.toUtf8Bytes;
    repl.context.toUtf8String = ethers.utils.toUtf8String;

    repl.defineCommand('ls', {
        help: 'list the directory',
        action: function(name) {
            if (!name) { name = '.'; }
            //this.lineParser.reset();
            if (this.clearBufferedCommand) {
                this.clearBufferedCommand()
            } else {
                this.bufferedCommand = '';
            }
            fs.readdirSync(path.resolve(name)).forEach(function(filename) {
                console.log('  ' + filename);
            });
            this.displayPrompt();
        }
    });

    repl.defineCommand('cat', {
        help: 'cat a file',
        action: function(name) {
            //this.lineParser.reset();
            if (this.clearBufferedCommand) {
                this.clearBufferedCommand()
            } else {
                this.bufferedCommand = '';
            }
            if (name) {
                console.log(fs.readFileSync(path.resolve(name)).toString());
            }
            this.displayPrompt();
        }
    });

    return new Promise(function(resolve, reject) {
        repl.on('exit', function() {
            console.log('');
            resolve();
        });
    });
}

getopts(options).then(function(opts) {

    // Check command line options make sense

    if (opts.options.help) { getopts.throwError(); }

    if (opts.options.version) {
        console.log('ethers/' + version);
        return function() { }
    }

    var command = 'sandbox';
    if (opts.args.length > 0) {
        command = opts.args.shift();
    }

    switch(command) {
        case 'keccak': return (function() {
            var data = opts.args.shift();
            var info = normalize(data, opts.options);
            return (function() {
                console.log('KECCACK256(' + info.kind + ':' + data + ') = ' + ethers.utils.keccak256(info.data));
            });
        })();

        case 'sha256': return (function() {
            var data = opts.args.shift();
            var info = normalize(data, opts.options);
            return (function() {
                console.log('SHA2-256(' + info.kind + ':' + data + ') = ' + ethers.utils.sha256(info.data));
            });
        })();

        case 'namehash': return (function() {
            var name = opts.args.shift();
            return (function() {
                console.log('NAMEHASH(' + name + ') = ' + ethers.utils.namehash(name));
            });
        })();

        case 'sighash': return (function() {
            var signature = opts.args.shift();
            var match = signature.match(/((\S+)\s*\(([^)]*?)\))/);
            if (!match) {
                getopts.throwError('invalid signature');
            }

            var method = match[2];
            var params = [];
            match[3].split(',').forEach(function(pair) {
                params.push(pair.trim().split(/\s+/)[0]);
            });

            signature = method + '(' + params.join(',') + ')';

            return (function() {
                var sighash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(signature)).substring(0, 10);
                console.log('SIGHASH(' + signature + ') = ' + sighash);
            });
        })();

        case 'utf8-bytes': return (function() {
            var text = opts.args.shift();
            return (function() {
                console.log('BYTES(' + text + ') = ' + ethers.utils.hexlify(ethers.utils.toUtf8Bytes(text)));
            });
        })();

        case 'utf8-string': return (function() {
            var data = opts.args.shift();
            return (function() {
                console.log('STRING(' + data + ') = ' + ethers.utils.toUtf8String(data));
            });
        })();

        case 'sandbox': return (function() {
            return (function() {
                return doSandbox(opts);
            });
        })();

/*
        case 'foo': return (function() {
            return (function() {
            });
        })();
*/
        default:
            getopts.throwError('unknown command; ' + command);
    }

}).then(function(run) {
    return run();

}, function (error) {
    console.log('');
    console.log('Command Line Interface - ethers/' + version);
    console.log('');
    console.log('Usage:');
    console.log('');
    console.log('    ethers keccak DATA [ --utf8 | --hex ]');
    console.log('    ethers sha256 DATA [ --utf8 | --hex ]');
    console.log('    ethers namehash NAME');
    console.log('    ethers sighash SIGNATURE');
    console.log('    ethers utf8-bytes TEXT');
    console.log('    ethers utf8-string DATA');
    console.log('');
    console.log('    ethers sandbox [ Node Options ]');
//    console.log('    ethers abi-encode TYPES ARGS');
//    console.log('    ethers abi-decode TYPES DATA');
//    console.log('');
//    console.log('    ethers info ADDRESS_OR_HASH_OR_TAG [ Node Options ]');
//    console.log('    ethers account [ --show-secret ] [ Account + Node Options ]');
    //console.log('');
    //console.log('    ethers encrypt FILENAME [ Account ]');
//    console.log('');
//    console.log('    ethers init FILENAME');
//    console.log('    ethers send [ Account + Node + Tx Options ]');
//    console.log('    ethers sign [ Account + Tx Options ]');
    console.log('');
    console.log('Account Options');
    console.log('  --account FILENAME');
    console.log('');
    console.log('Transaction Options');
    console.log('  --to ADDRESS');
    console.log('  --gas-limit LIMIT');
    console.log('  --gas-price GWEI');
    console.log('  --data DATA');
    console.log('  --nonce NONCE');
    console.log('  --value ETHER');

    if (error.message) { throw error; }
    console.log('');

}).catch(function(error) {
    console.log('');
    if (!error._messageOnly) {
        console.log(error.stack);
    } else {
        console.log('Error: ' + error.message);
    }
    console.log('');
});
