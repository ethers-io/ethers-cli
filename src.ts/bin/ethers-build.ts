#!/usr/bin/env node

'use strict';

var fs = require('fs');
var path = require('path');
var REPL = require('repl');
var util = require('util');

var ethers = require('ethers');

var Git = require('../lib/git');
var Slug = require('../lib/slug');

var api = require('../lib/api');
var builders = require('../lib/builders');
var compiler = require('../lib/compiler');
var getopts = require('../lib/getopts');
var WebServer = require('../lib/webserver');

var version = require('../package.json').version;

var accountFilename = './account.json';

var options = {
    help: false,
    version: false,

    optimize: false,
    contract: '',
    args: '',
    bytecode: false,
    interface: false,
    solc: false,

    head: false,
    published: false,
    host: '127.0.0.1',
    port: 8080,
    slug: [],
    signed: false,

    _accounts: true,
    _provider: true,
    _promises: true,
};

// @TODO: This was migrated from ethers-cli and requires substantial refactoring
function getSources(git, filenamesForStaging, opts) {

    function Source(name, versions) {
        this.name = name;
        this.versions = versions;
    }

    function getHashes(filenames) {
        return new Promise(function(resolve, reject) {
            var versions = {};
            Object.defineProperty(versions, '_useFilename', {
                enumerable: false,
                value: true
            });

            var getHashes = [];
            filenames.forEach(function(filename) {
                getHashes.push(new Promise(function(resolve, reject) {
                    fs.readFile(filename, function(error, data) {
                        if (error) {
                            reject(error);
                            return;
                        }
                        versions[filename] = Git.getHash(data);
                        resolve();
                    });
                }));
            });

            Promise.all(getHashes).then(function() {
                resolve(versions);
            }, function(error) {
                reject(error);
            });
        });
    }

    function getStaging() {
        return Promise.all([
            git.status(),
            git.listTree(),
        ]).then(function(result) {
            var status = result[0];
            var listTree = Object.keys(result[1]);

            var versions = {};
            (status.notAdded || []).forEach(function(filename) {
                versions[filename] = null;
            });

            var filenames = {};
            listTree.forEach(function(filename) {
                filenames[filename] = true;
            });
            ['created', 'deleted', 'modified'].forEach(function(tag) {
                (status[tag] || []).forEach(function(filename) {
                    filenames[filename] = true;
                });
            });
            filenames = Object.keys(filenames);

            return getHashes(filenames).then(function(result) {
                for (var key in result) {
                    versions[key] = result[key];
                }
                return new Source('staging', versions);
            });
        });
    }

    function getSlugVersions(slugJSON) {
        try {
            var slug = Slug.load(slugJSON);
            var versions = {};
            slug.filenames.forEach(function(filename) {
                versions[filename] = slug.getGitHash(filename);
            });
            return Promise.resolve(new Source('slug', versions));
        } catch (error) {
            return Promise.reject(error);
        }
    }

    function publishedVersions(address) {
        return api.getSlugVersions(address).then(function(versions) {
            return new Source('published', versions);
        });
    }

    var sources = [];

    opts.options.slug.forEach(function(filename) {
        var slugJSON = fs.readFileSync(filename).toString();
        sources.push(getSlugVersions(slugJSON));
    });

    if (opts.options.head) {
        var getHead = git.listTree().then(function(versions) {
            return new Source('head', versions);
        });
        sources.push(getHead);
    }

    if (fs.existsSync(accountFilename)) {
        var address = JSON.parse(fs.readFileSync(accountFilename).toString()).address;

        if (sources.length === 0) {
            sources.push(publishedVersions(address));
            sources.push(getStaging());
        } else if (opts.options.published) {
            sources.unshift(publishedVersions(address));
        }
    }

    if (sources.length === 0) {
        return Promise.reject(new Error('no sources to compare'));

    } else if (sources.length === 1) {
        sources.push(getStaging());
    }

    return Promise.all(sources);
}

function doCompile(filename, optimize, name, formats) {
    try {
        var output = compiler.compile(filename, options.optimize, true);
    } catch (error) {
        if (error.errors) {
           error.errors.forEach(function(error) {
                console.log('Error: ' + error.filename + ':' + error.row + ':' + error.column + ': ' + error.message);
                if (error.code) {
                    error.code.split('\n').forEach(function(line) {
                        console.log('    ' + line);
                    });
                }
            });
            getopts.throwError('compilation failed');
        }
        throw error;
    }

    if (name) {
        output = output[name];;

    } else {
        var names = Object.keys(output);
        if (names.length > 1) {
            throw new Error('must choose a contract: ', names.join(', '));
        } else if (names.length === 0) {
            throw new Error('no contract found');
        }
        output = output[names[0]];
    }

    if (Object.keys(formats).length === 1) {
        if (formats.bytecode) { return output.bytecode; }
        if (formats.interface) { return JSON.stringify(output.interface, null, '    '); }
        if (formats.solc) { JSON.stringify(output._solc); }
    }

    var result = {};

    if (formats.bytecode) { result.bytecode = output.bytecode; }
    if (formats.interface) { result.interface = output.interface; }
    if (formats.solc) { result.interface = output._solc; }

    return JSON.stringify(result, null, '    ');
}

function doDeploy(provider, accounts, deploy, options) {
    var builder = new builders.Builder(provider, accounts, deploy);
    return builder.deploy();
}

function doSandbox() {
    var builder = new builders.TestBuilder();

    var repl = REPL.start('sandbox> ');

    var defaultEval = repl.eval.bind(repl);
    repl.eval = function(cmd, context, filename, callback) {
        defaultEval(cmd, context, filename, function(error, result) {
            if (result instanceof Promise) {

                repl.context._p = result;

                var timer = setTimeout(function() {
                    console.log(util.inspect(result));
                    timer = null;
                }, 500);

                result.then(function(result) {
                    if (timer) {
                        clearTimeout(timer);
                        console.log('Resolved:');
                    }
                    repl.context._p = result;
                    callback(null, result);

                }, function(error) {
                    if (timer) {
                        clearTimeout(timer);
                        console.log('Rejected:');
                    }
                    repl.context._p = error;
                    callback(error);
                });

            } else {
                callback(error, result);
            }
        });
    }

    // @TODO: Make these read-only

    repl.context.provider = builder.provider;
    repl.context.accounts = builder.accounts;
    repl.context.compile = builder.compile.bind(builder);

    repl.context.ethers = ethers;

    repl.context.Contract = ethers.Contract;
    repl.context.Interface = ethers.Interface;
    repl.context.Wallet = ethers.Wallet;

    repl.context.providers = ethers.providers;

    repl.context.utils = ethers.utils;

    repl.context.BN = ethers.utils.bigNumberify;
    repl.context.bigNumberify = ethers.utils.bigNumberify;
    repl.context.formatEther = ethers.utils.formatEther;
    repl.context.getAddress = ethers.utils.getAddress;
    repl.context.getContractAddress = ethers.utils.getContractAddress;
    repl.context.hexlify = ethers.utils.hexlify;
    // @TODO: this is in utils now
    repl.context.id = function(text) {
        return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(text));
    };
    repl.context.keccak256 = ethers.utils.keccak256;
    repl.context.namehash = ethers.utils.namehash;
    repl.context.parseEther = ethers.utils.parseEther;
    repl.context.randomBytes = ethers.utils.randomBytes;
    repl.context.sha256 = ethers.utils.sha256;
    repl.context.toUtf8Bytes = ethers.utils.toUtf8Bytes;
    repl.context.toUtf8String = ethers.utils.toUtf8String;

    repl.defineCommand('ls', {
        help: 'list the directory',
        action: function(name) {
            if (!name) { name = '.'; }
            this.lineParser.reset();
            this.bufferedCommand = '';
            fs.readdirSync(path.resolve(name)).forEach(function(filename) {
                console.log('  ' + filename);
            });
            this.displayPrompt();
        }
    });

    repl.defineCommand('cat', {
        help: 'cat a file',
        action: function(name) {
            this.lineParser.reset();
            this.bufferedCommand = '';
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

function doPrepare(account, options) {
    var seq = Slug.generate();

    if (account) {
        seq = seq.then(function(slug) {
            return {
                filename: account.address,
                payload: slug.sign(account.privateKey)
            }
        });
    } else {
        seq = seq.then(function(slug) {
            return {
                filename: 'unsigned',
                payload: slug.unsigned()
            }
        });
    }

    return seq.then(function(result) {
        fs.writeFileSync(result.filename + '.slug', result.payload);
    });
}

function doPublish(slugData) {
    return api.putSlug(null, slugData);
}

function doServe(provider, host, port, slug, options) {

    if (slug) {
        var handler = function(path) {
            path = path.substring(1);
            var data = slug.getData(path);
            return new Promise(function(resolve, reject) {
                if (data) {
                    resolve({
                        path: 'slug://' + path,
                        body: data
                    });
                } else {
                    reject(WebServer.makeError(404, 'Not Found'));
                }
            });
        };
    } else {
        var handler = WebServer.staticFileHandler();
    }

    var webServer = new WebServer(handler, { host: host, port: port });

    webServer.addOverride(accountFilename, WebServer.makeError(403, 'Forbidden'));

    webServer.start(function() {
        var path = '/#!/app-link-insecure/localhost:' + webServer.port + '/';

        console.log('Listening on port: ' + webServer.port);
        console.log('Local Application Test URL:');
        console.log('  mainnet: http://ethers.io' + path);
        console.log('  ropsten: http://ropsten.ethers.io' + path);
        console.log('  rinkeby: http://rinkeby.ethers.io' + path);
        console.log('  kovan:   http://kovan.ethers.io' + path);
    });

    return new Promise(function(resolve, reject) {
        // @TODO: Make this resolve whent he server shuts down
    });
}

getopts(options).then(function(opts) {

    // Check command line options make sense

    if (opts.options.help) { getopts.throwError(); }

    if (opts.options.version) {
        console.log('ethers-build/' + version);
        return function() { }
    }

    var command = 'sandbox';
    if (opts.args.length > 0) {
        command = opts.args.shift();
    }


    function ensureArgs(count) {
        if (opts.args.length !== count) {
            getopts.throwError(command + 'requires ' + count + ' arguments');
        }
    }

    switch (command) {
        case 'compile': return (function() {
            ensureArgs(1);
            var formats = {};
            if (opts.options.bytecode) { formats.bytecode = true; }
            if (opts.options.interface) { formats.interface = true; }
            if (opts.options.solc) { formats.solc = true; }
            if (Object.keys(formats).length === 0) { formats = { bytecode: true, interface: true } };

            return (function() {
                var output = doCompile(opts.args[0], opts.options.optimize, (opts.options.contract || null), formats);
                console.log(output);
                return Promise.resolve(output);
            });
        })();

        case 'deploy': return (function() {
            ensureArgs(1);
            var filename = opts.args.shift();

            var prohibit = [];

            if (filename.substring(filename.length - 4) === '.sol') {
                var deployFunc = function(builder) {
                    var codes = builder.compile(filename, true);
                    var codeNames = Object.keys(codes);
                    if (codeNames.length === 0) {
                        getopts.throwError('no contracts found');

                    } else if (codeNames.length === 1) {
                        var code = codes[codeNames[0]];

                    } else if (codeNames.length > 1) {
                        if (!opts.options.contract) {
                            getopts.throwError('multiple contract found; [ ' + codeNames.join(', ') + ' ]; use --contract NAME');
                        }
                        var code = codes[opts.options.contract];
                        if (!code) {
                            getopts.throwError('contract not found; ' + opts.options.contract);
                        }
                    }

                    var args = [];
                    if (opts.options.args) {
                        args = JSON.parse(opts.options.args);
                    }

                    return code.deploy.apply(code, args);
                }

                prohibit = ['data'];

            } else if (filename.substring(filename.length - 3) === '.js') {
                try {
                    var deployFunc = require(path.resolve(filename));
                } catch (error) {
                    console.log(error);
                    getopts.throwError('cannot load ' + filename);
                }

                prohibit = ['data', 'value'];
                //prohibit = ['data', 'nonce', 'value'];

            } else {
                getopts.throwError('invalid file type');
            }

            // Some parameters that _accounts give us that we don't want for deploy
            prohibit.forEach(function(key) {
                if (opts.explicit[key]) {
                    getopts.throwError('unknown option: --' + key);
                }
            });

            return (function() {
                return doDeploy(opts.provider, opts.accounts, deployFunc, options);
            });
        })();

        case 'sandbox': return (function() {
            return (function() {
                return doSandbox(opts.provider, opts.accounts);
            });
        })();

        case 'init': return (function() {
            return (function() {
                if (fs.existsSync(accountFilename)) {
                    getopts.throwError('Account already exists (' + accountFilename + ').');
                }

                var account = ethers.Wallet.createRandom();

                console.log('Do NOT lose or forget this password. It cannot be reset.');
                var password = getopts.getPassword('New Account Password: ');
                var confirmPassword = getopts.getPassword('Confirm Password: ');
                if (Buffer.compare(password, confirmPassword) !== 0) {
                    getopts.throwError('Passwords did NOT match. Aborting.');
                }

                console.log('Encrypting Account... (this may take a few seconds)');
                return account.encrypt(password).then(function(json) {
                    try {
                        fs.writeFileSync(accountFilename, json, {flag: 'wx'});
                        console.log('Account successfully created. Keep this file SAFE. Do NOT check it into source control');
                    } catch (error) {
                        getopts.throwError('Error saving account.js: ' + error.message);
                    }
                }, function(error) {
                    getopts.throwError('Error encrypting account: ' + error.message);
                });
            });
        })();

        case 'prepare': return (function() {
            return (function() {
                var accountPromise = Promise.resolve(null);
                if (opts.options.signed) {
                    if (!fs.existsSync(accountFilename)) {
                        getopts.throwError('prepare --signed requires account (use ethers-build init)');
                    }
                    accountPromise = getopts.Account().parseValue(accountFilename).then(function(account) {
                        return account.requestAccount(true);
                    });
                }

                return accountPromise.then(function(account) {
                    return doPrepare(account, opts.options);
                });
            });
        })();

        case 'publish': return (function() {
            ensureArgs(1);

            return (function() {
                var slugData = fs.readFileSync(opts.args[0]).toString()

                var slug = Slug.load(slugData);

                var seq = Promise.resolve(slugData);

                if (!slug.signed) {
                    if (!fs.existsSync(accountFilename)) {
                        getopts.throwError('deploy of unsigned slug requires account (use ethers-build init)');
                    }

                    seq = seq.then(function() {
                        return getopts.Account().parseValue(accountFilename).then(function(account) {
                            return account.requestAccount(true);
                        }).then(function(account) {
                            return slug.sign(account.privateKey);
                        });
                    });
                }

                return seq.then(function(slugData) {
                    return doPublish(slugData);
                }).then(function(host) {
                    console.log('Application URLs:');
                    console.log('  Mainnet:  https://ethers.io/#!/app-link/' + host);
                    console.log('  Ropsten:  https://ropsten.ethers.io/#!/app-link/' + host);
                    console.log('  Rinkebey: https://rinkeby.ethers.io/#!/app-link/' + host);
                    console.log('  Kovan:    https://kovan.ethers.io/#!/app-link/' + host);
                    console.log('Successfully deployed!');
                }, function(error) {
                    console.log('Error deploying:');
                    console.log(error);
                });
            });
        })();

        case 'serve': return (function() {
            var slugs = opts.options.slug;
            if (slugs.length > 1) { getopts.throwError('serve may only have one --slug'); }
            var slug = null;
            if (slugs.length) {
                slug = Slug.verify(fs.readFileSync(slugs[0]).toString(), true);
            }
            return (function() { doServe(opts.provider, opts.options.host, opts.options.port, slug, options); });
        })();

        case 'status': return (function() {
            var git = new Git('.');
            return (function() {
                return getSources(git, false, opts).then(function(sources) {
                    var allFilenames = {};
                    sources.forEach(function(source) {
                        for (var filename in source.versions) {
                            allFilenames[filename] = true;
                        }
                    });
                    allFilenames = Object.keys(allFilenames);
                    allFilenames.sort();

                    var changes = [];
                    var untracked = [];

                    allFilenames.forEach(function(filename) {
                        var hashFrom = sources[0].versions[filename];
                        var hashTo = sources[1].versions[filename];

                        if (!hashFrom && !hashTo) {
                            untracked.push(filename);

                        } else if (!hashFrom && hashTo) {
                            changes.push({filename: filename, action: 'added      '});

                        } else if (hashFrom && !hashTo) {
                            changes.push({filename: filename, action: 'removed:   '});

                        } else if (hashFrom !== hashTo) {
                            changes.push({filename: filename, action: 'modified:  '});
                        }
                    });

                    if (changes.length) {
                        console.log('File Status:');
                        changes.forEach(function(change) {
                            console.log('    ' + change.action + change.filename);
                        });
                    } else {
                        console.log('No files changed.');
                    }

                    if (untracked.length) {
                        console.log('Untracked Files:');
                        untracked.forEach(function(filename) {
                            console.log('    ' + filename);
                        });
                    }
                });
            });
        })();

        // diff => diff between published:hash filename
        // diff --slug SLUG => diff between slug:hash filename
        // diff --slug SLUG --published => diff between published:hash slug:filename
        // diff --slug SLUG --slug SLUG => diff between slug:hash slug:filename
        case 'diff': return (function() {
            var git = new Git('.');
            return (function() {
                return getSources(git, true, opts).then(function(sources) {
                    var allFilenames = {};
                    sources.forEach(function(source) {
                        for (var filename in source.versions) {
                            allFilenames[filename] = true;
                        }
                    });
                    allFilenames = Object.keys(allFilenames);
                    allFilenames.sort();

                    allFilenames.forEach(function(filename) {
                        var hashFrom = sources[0].versions[filename];
                        var hashTo = sources[1].versions[filename];
                        if (!hashFrom && !hashTo) {

                        } else if (!hashFrom && hashTo) {
                            console.log('Added: ' + filename);

                        } else if (hashFrom && !hashTo) {
                            console.log('Removed: ' + filename);

                        } else if (hashFrom !== hashTo) {
                            if (sources[1].name === 'staging') {
                                hashTo = filename;
                            }
                            git.diff(hashFrom, hashTo).then(function(result) {
                                console.log(result);
                            });
                        }
                    });
                });
            });
        })();

        default:
            getopts.throwError('unknown command; ' + command);
    }

}).then(function(run) {
    return run();

}, function(error) {
    console.log('');
    console.log('Command Line Interface - ethers-build/' + version);
    console.log('');
    console.log('Usage:');
    console.log('');
    console.log('    ethers-build compile FILENAME [ Compiler Options ] [ --optimize ]');
    console.log('');
    console.log('    ethers-build deploy FILENAME.js [ Node + Account + Tx Options ]');
    console.log('    ethers-build deploy FILENAME.sol [ Node + Account + Tx Options ]');
    console.log('');
    console.log('    ethers-build serve [ --slug SLUG ] [ --host HOST ] [ --port PORT ] [ Node Options ]');
    console.log('    ethers-build init');
    console.log('    ethers-build status [ --head ] [ --slug A ] [ --slug B ] [ --published ]');
    console.log('    ethers-build diff [ --head ] [ --slug A ] [ --slug B ] [ --published ]');
    console.log('    ethers-build prepare [ --signed ]');
    console.log('    ethers-build publish --slug SLUG');
    console.log('');
    console.log('Compile Options');
    console.log('  --bytecode            Only output bytecode');
    console.log('  --interface           Only output the JSON interface');
    console.log('  --solc                Output the entire solc output');
    console.log('  --optimize            Run the optimizer');
    console.log('');
    console.log('Node Options');
    console.log('  --testnet             Use "ropsten" configuration (deprecated)');
    console.log('  --network NETWORK     Use NETWORK configuration (default: homestead)');
    console.log('  --rpc URL             Use the Ethereum node at URL');
    console.log('');
    console.log('Account Options');
    console.log('  --account FILENAME    Use the JSON wallet');
    //console.log('  --private-key KEY     Use the private key (use - for secure entry)');
    //console.log('  --mnemonic PHRASE     Use the mneonic (use - for secure entry)');
    console.log('');
    console.log('Transaction Options');
    console.log('  --gas-price GWEI      Override the gas price');
    console.log('  --gas-limit LIMIT     Override the gas limit');
    console.log('  --nonce NONCE         Override the nonce (.sol only)');
    console.log('  --value ETHER         Send ether (.sol only)');
    console.log('');
    console.log('Options');
    console.log('  --help                Show this help');
    console.log('  --version             Show the version');

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
