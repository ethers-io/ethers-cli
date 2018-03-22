/**
 *
 *  Possible values for keys in options:
 *    - string           - Any value will be preserved
 *    - true or false    - A flag, whose value will be toggled if present
 *    - [ ]              - An array will be used to push multiple strings
 *    - getopts.Address  - An address
 *    - getopts.Account  - An account wrapping a filename, which will be loaded and request permission for each send
 */

// WARNING: This is EXPERIMENTAL and not used by ethers yet; see ethers-build.

var fs = require('fs');
var readline = require('readline');

var ethers = require('ethers');
var readlineSync = require('readline-sync');

var showPromiseErrors = false;

var NO_NONCE = 0xffffffff;

function getPassword(message) {
    if (!message) { message = 'Account Password: '; }
    /*
    var rl = readline.createInterface({
        input: process.stdin,
        output: null //process.stdout
    });

    return new Promise(function(resolve, reject) {
        process.stdout.write(message);
        rl.question('', function(answer) {
            // rl.close() borks keypress events and ruins the stream in REPL
            rl.pause();
            process.stdin.resume();
            resolve(new Buffer(password.normalize('NFKC')));
        });
    });
*/
    var password = readlineSync.question(message, { hideEchoBack: true });
    return new Buffer(password.normalize('NFKC'));
}

function getConfirm(message) {
   var confirm = readlineSync.keyInYN(message);
   //process.stdin.resume();
   return confirm;
}

function getConfirm2(message) {
    var rl = readline.createInterface({
        input: process.stdin,
        output: null //process.stdout
    });

    return new Promise(function(resolve, reject) {
        function ask() {
            process.stdout.write(message);
            rl.question('', function(answer) {
                // rl.close() borks keypress events and ruins the stream in REPL
                var value = null;
                switch(answer) {
                    case 'Y': case 'y':
                        value = true;
                        break;
                    case 'N': case 'n':
                        value = false;
                        break;
                    default:
                        setTimeout(ask, 0);
                        return;
                }

                rl.pause();
                process.stdin.resume();
                resolve(value);
            });
        }
        ask();
    });
}

function copyObject(object) {
    var result = {};
    for (var key in object) { result[key] = object[key]; }
    return result;
}

function getopts(options, argv) {
    if (!argv) { argv = process.argv.slice(2); }

    var opts = {
        args: [],
        explicit: {},
        options: {}
    }

    if (options._provider) {
        options.rpc = '';
        options.network = 'homestead';
    }

    if (options._accounts) {
        options.account = [ Account() ];
        options.nonce = NO_NONCE;
        options['local-accounts'] = false;
        options['data'] = '0x';
        options['gas-limit'] = 1500000;
        options['gas-price'] = Gwei('2.1');
        options['value'] = Ether('0.0');
    }

    if (options._promises && !showPromiseErrors) {
        showPromiseErrors = true;
        process.on('unhandledRejection', function(reason, p){
            console.log("Possibly Unhandled Rejection at: Promise ", p, " reason: ", reason);
        });
    }

    var seq = Promise.resolve(opts);

    for (var i = 0; i < argv.length; i++) {
       var param = argv[i];

        // Non-keyword arguments
        if (param.substring(0, 2) !== '--') {
            opts.args.push(param);
            continue;
        }

        var key = param.substring(2);

        // Specified an option that is treated as a flag (no additional value)
        if (options[key] === false || options[key] === true) {
            opts.explicit[key] = true;
            opts.options[key] = !options[key];
            continue;
        }

        // Specified an option we don't support
        if (options[key] == undefined) {
            throw new Error('unknown option: --' + key);
        }
        opts.explicit[key] = true;

        var value = argv[++i];

        // Last entry was a keyword option
        if (value === undefined) {
            throw new Error('missing value for option: ' + key);
        }

        // A numeric keyword option
        if (typeof(options[key]) === 'number') {

            // Ensure it is an integer
            if (options[key] != parseInt(options[key])) {
                throw new Error('invalid default value for ' + key);
            }

            var valueInt = parseInt(value);
            if (valueInt != value) {
                throw new Error('invalid integer value for ' + key + ' = ' + value);
            }

            value = valueInt;
        }

        if (Array.isArray(options[key])) {
            if (!opts.options[key]) { opts.options[key] = []; }
            opts.options[key].push(value);

        } else {
            if (opts.options[key] != null) {
                throw new Error('duplicate value for key ' + key);
            }
            opts.options[key] = value;
        }
    }

    if (opts.options['local-accounts']) {
        // We need to fetch the local accounts from the node
        if (opts.options.account != null) {
            throw new Error('cannot use --local-accounts with --account');
        }

        if (!opts.options.rpc) {
            throw new Error('cannot use --local-accounts without --rpc NODE');
        }

        // We fill this in below, once we have a provider
        opts.options.account = [ ];

    } else if (options._defaultAccount && opts.options.account == null) {
        // If we have a default account filename and no account, try it
        try {
            fs.accessSync(options._defaultAccount, fs.constants.R_OK);
            opts.options.account = [ options._defaultAccount ];
        } catch (error) { }
    }

    // Populate the default values
    Object.keys(options).forEach(function(key) {
        if (opts.options[key] === undefined) {
            if (options[key].defaultValue) {
                opts.options[key] = options[key].defaultValue;;
            } else if (Array.isArray(options[key])) {
                opts.options[key] = [];
            } else {
                opts.options[key] = options[key];
            }
        }
    });

    return seq.then(function() {

        // If a provider was requested, make sure we create one...
        if (options._provider) {
            var network = opts.options.network;
            if (opts.options.rpc) {
                opts.provider = new ethers.providers.JsonRpcProvider(opts.options.rpc, network);
            } else {
                opts.provider = ethers.providers.getDefaultProvider(network);
            }
        }

        if (opts.options['local-accounts']) {
            opts.options.account = opts.provider.send('eth_accounts', []).then(function(accounts) {
                var result = [];
                accounts.forEach(function(address) {
                    result.push({
                        address: address,
                        getAddress: function() { return Promise.resolve(address); },
                        provider: opts.provider,
                        sendTransaction: function(tx) {
                            return Account.confirmTransaction(opts, tx, address).then(function(tx) {
                                tx = ethers.providers.JsonRpcProvider._hexlifyTransaction(tx);
                                return opts.provider.send('eth_sendTransaction', [ tx ]).then(function(hash) {
                                    tx.hash = hash;
                                    return tx;
                                });
                            });
                        },
                        signMessage: function(message) {
                            return Account.confirmMessage(message).then(function(message) {
                                var data = ((typeof(message) === 'string') ? ethers.utils.toUtf8Bytes(message): message);
                                return opts.provider.send('eth_sign', [ address, ethers.utils.hexlify(data) ]);
                            });
                        }
                    });
                });
                return result;
            });
        }

        var seq = Promise.resolve();

        Object.keys(options).forEach(function(key) {
            if (opts.options[key] instanceof Promise) {
                seq = seq.then(function() {
                    return opts.options[key].then(function(result) {
                        opts.options[key] = result;
                    });
                });
            } else if (Array.isArray(options[key])) {
                if (options[key][0] && options[key][0].parseValue) {
                    opts.options[key].forEach(function(value, index) {
                        seq = seq.then(function() {
                            return options[key][0].parseValue(value, opts).then(function(value) {
                                opts.options[key][index] = value;
                            });
                        });
                    });
                }
            } else if (options[key].parseValue) {
                seq = seq.then(function() {
                    return options[key].parseValue(opts.options[key], opts).then(function(value) {
                        opts.options[key] = value;
                    });
                });
            }
        });

        return seq.then(function() {
            if (options._accounts) {
                opts.accounts = opts.options.account;
                delete opts.options.account;
            }
            return opts;
        });
    });
}

function Address(defaultValue) {
    if (!(this instanceof Address)) { return new Address(defaultValue); }
    this.defaultValue = defaultValue;
}
getopts.Address = Address;

Address.prototype.parseValue = function(value, opts) {
    return opts.provider.resolveName(value);
}


function Account(defaultValue) {
    if (!(this instanceof Account)) { return new Account(defaultValue); }
    this.defaultValue = defaultValue;
}
getopts.Account = Account;

Account.confirmTransaction = function(opts, tx, fromAddress) {
    function showTransaction(tx) {

        if (tx.data == null) {
            tx.data = opts.options['data'];
        }

        if (tx.gasLimit == null) {
            tx.gasLimit = opts.options['gas-limit'];
        }

        if (tx.gasPrice == null) {
            tx.gasPrice = opts.options['gas-price'];
        }

        if (tx.value == null ) {
            tx.value = opts.options.value;
        }

        var seq = Promise.resolve();
        seq = seq.then(function() {
            var noncePromise = null;
            if (tx.nonce != null) {
                noncePromise = Promise.resolve(tx.nonce);
            } else if (opts.options.nonce == NO_NONCE) {
                noncePromise = opts.provider.getTransactionCount(tx.from);
            } else {
                noncePromise = Promise.resolve(opts.options.nonce);
            }

            return Promise.all([
                opts.provider.getBalance(tx.from),
                noncePromise
            ]).then(function(result) {
                tx.nonce = result[1];
                console.log('Sign Transaction:');
                console.log('    Network:       ' + opts.provider.name);
                console.log('    From:          ' + tx.from);
                console.log('    Balance:       ' + ethers.utils.formatEther(result[0]));
                console.log('    To:            ' + tx.to);
                console.log('    Value:         ' + ethers.utils.formatEther(tx.value) + ' ether');
                console.log('    Gas Price:     ' + ethers.utils.formatUnits(tx.gasPrice, 'gwei') + ' Gwei');
                console.log('    Gas Limit:     ' + tx.gasLimit);
                console.log('    Nonce:         ' + tx.nonce);
                console.log('    Data:          ' + (tx.data ? (tx.data.length / 2 - 1): 0) + ' bytes');

                return tx;
            });
        });

        return seq;
    }

    tx = copyObject(tx);
    tx.from = fromAddress;
    return showTransaction(tx).then(function(tx) {
        var confirm = getConfirm('Send Transaction? ');
        if (!confirm) {
            console.log('Cancelling!');
            process.exit(1);
            throw new Error('cancelled');
        }

        return tx;
    });
}

Account.confirmMessage = function(message) {
    console.log('Sign Message:');
    if (typeof(message) === 'string') {
        console.log('    Message: ' + message);
    } else {
        console.log('    Data: ' + ethers.utils.hexlify(message));
    }

    return new Promise(function(resolve, reject) {
        setTimeout(function() {
            var confirm = getConfirm('Sign Message? ');

            if (!confirm) {
                console.log('Cancelling!');
                process.exit(1);
                var error = new Error('cancelled');
                throw error;
                reject(error);
            }

            resolve(message);
        }, 0);
    });
};

Account.prototype.parseValue = function(value, opts) {
    var json = fs.readFileSync(value).toString();

    var address = ethers.utils.getAddress(JSON.parse(json).address);
    var wallet = null;

    var unlockPromise = null;
    function getUnlock() {
        if (!unlockPromise) {
            unlockPromise = new Promise(function(resolve, reject) {
                setTimeout(function() {
                    var password = getPassword('Account Password (' + opts.provider.name + ':' + value + '): ');
                    return ethers.Wallet.fromEncryptedWallet(json, password).then(function(unlockedWallet) {
                        unlockedWallet.provider = opts.provider;
                        wallet = unlockedWallet;
                        resolve();
                    }, function(error) {
                        reject(error);
                    });
                }, 0);
            });
        }
        return unlockPromise;
    }

    function signMessage(message) {
        if (!wallet) {
            return getUnlock().then(function() {
                return signMessage(message);
            });
        }

        if (address !== wallet.address) { throw new Error('address mismatch'); }

        return Account.confirmMessage(message).then(function(message) {
            return Promise.resolve(wallet.signMessage(message));
        });
    }

    function sendTransaction(tx) {
        if (!wallet) {
            return getUnlock().then(function() {
                return sendTransaction(tx);
            });
        }

        if (address !== wallet.address) { throw new Error('address mismatch'); }

        if (tx.from) { throw new Error('cannot specify from address'); }

        return Account.confirmTransaction(opts, tx, wallet.address).then(function(tx) {
            return wallet.sendTransaction(tx);
        });
    }

    return Promise.resolve({
        address: address,
        getAddress: function() { return Promise.resolve(address); },
        provider: opts.provider,
        signMessage: signMessage,
        sendTransaction: sendTransaction
    });
}


function Ether(defaultValue) {
    if (!(this instanceof Ether)) { return new Ether(defaultValue); }
    this.defaultValue = defaultValue;
}
getopts.Ether = Ether;

Ether.prototype.parseValue = function(value) {
    return new Promise(function(resolve, reject) {
        resolve(ethers.utils.parseEther(value));
    });
}


function Gwei(defaultValue) {
    if (!(this instanceof Gwei)) { return new Gwei(defaultValue); }
    this.defaultValue = defaultValue;
}
getopts.Gwei = Gwei;

Gwei.prototype.parseValue = function(value) {
    return new Promise(function(resolve, reject) {
        resolve(ethers.utils.parseEther(value).div(1000000000));
    });
}

getopts.getPassword = getPassword;

getopts.throwError = function(message) {
    if (!message) { message = ''; }
    var error = new Error(message);
    error._messageOnly = true;
    throw error;
}


module.exports = getopts;
