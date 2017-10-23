/**
 *
 *  Possible values for keys in options:
 *    - string          - Any value will be preserved
 *    - true or false   - A flag, whose value will be toggled if presert
 *    - [ ]             - An array will be used to push multiple strings
 */

// WARNING: This is EXPERIMENTAL and not used by ethers yet; see ethers-build.

var fs = require('fs');

var ethers = require('ethers');
var readlineSync = require('readline-sync');

var showPromiseErrors = false;

function getPassword(message) {
    if (!message) { message = 'Account Password: '; }
    var password = readlineSync.question(message, { hideEchoBack: true });
    password = password.normalize('NFKC');
    return new Buffer(password);
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
        options.testnet = false;
    }

    if (options._accounts) {
        options.account = [ Account() ];
        options.nonce = 0xffffffff;
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
            if (opts.options.rpc) {
                opts.provider = new providers.JsonRpcProvider(opts.options.rpc, opts.options.testnet);
            } else {
                opts.provider = ethers.providers.getDefaultProvider(opts.options.testnet);
            }
        }

        var seq = Promise.resolve();

        Object.keys(options).forEach(function(key) {
            if (Array.isArray(options[key])) {
                if (options[key][0] && options[key][0].parseValue) {
                    opts.options[key].forEach(function(value, index) {
                        seq = seq.then(function() {
                            return options[key][0].parseValue(value).then(function(value) {
                                if (value && value._wantsOptions) {
                                    value.opts = opts;
                                }
                                opts.options[key][index] = value;
                            });
                        });
                    });
                }
            } else if (options[key].parseValue) {
                seq = seq.then(function() {
                    return options[key].parseValue(opts.options[key]).then(function(value) {
                        if (value && value._wantsOpts) {
                            value.opts = opts;
                        }
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

Address.prototype.parseValue = function(value) {
    return new Promise(function(resolve, reject) {
        resolve(utils.getAddress(value));
    });
}


function Account(defaultValue) {
    if (!(this instanceof Account)) { return new Account(defaultValue); }
    this.defaultValue = defaultValue;
}
getopts.Account = Account;

Account.prototype.parseValue = function(value) {
    return new Promise(function(resolve, reject) {
        var json = fs.readFileSync(value).toString();
        var fauxAccount = {
            address: ethers.utils.getAddress(JSON.parse(json).address),
            _wantsOptions: true
        };
        var walletPromise = null;
        var getWalletPromise = (function(noNetwork) {
            if (walletPromise) { return walletPromise; }

            var network = '';
            if (!noNetwork) {
                network = (fauxAccount.opts.provider.testnet ? 'testnet:': 'mainnet:');
            }
            var password = getPassword('Account Password (' + network + value + '): ');
            walletPromise = ethers.Wallet.fromEncryptedWallet(json, password).then(function(wallet) {
                if (wallet.address != fauxAccount.address) {
                    throw new Error('address mismatch');
                }
                if (!noNetwork) {
                    wallet.provider = fauxAccount.opts.provider;
                }
                return wallet;
            });

            return walletPromise;
        });

        Object.defineProperty(fauxAccount, 'provider', {
            get: function() { return fauxAccount.opts.provider; }
        });

        Object.defineProperty(fauxAccount, 'requestAccount', {
            value: getWalletPromise
        });

        fauxAccount.sendTransaction = function(tx) {
            if (fauxAccount.opts.options.data != '0x' && tx.data !== fauxAccount.opts.options.data) {
                throw new Error('conflicting data request');
            }
            if (tx.value != null && fauxAccount.opts.options.value != null) {
                throw new Error('conflicting value request');
            }

            if (fauxAccount.opts.options.data == null) {
                tx.data = fauxAccount.opts.options.data;
            }
            if (tx.gasLimit == null) {
                tx.gasLimit = fauxAccount.opts.options['gas-limit'];
            }
            if (tx.gasPrice == null) {
                tx.gasPrice = fauxAccount.opts.options['gas-price'];
            }
            if (tx.nonce == null && fauxAccount.opts.options.nonce != 0xffffffff) {
                tx.nonce = fauxAccount.opts.options.nonce;
            }
            if (tx.value == null ) {
                tx.value = fauxAccount.opts.options.value;
            }

            console.log('Sign Transaction:');
            console.log('    Network:       ' + (fauxAccount.opts.provider.testnet ? 'testnet': 'mainnet'));
            console.log('    From:          ' + fauxAccount.address);
            console.log('    Gas Price:     ' + ethers.utils.formatEther(tx.gasPrice.mul(1000000000)) + ' Gwei');
            console.log('    Gas Limit:     ' + tx.gasLimit);
            console.log('    Value:         ' + ethers.utils.formatEther(tx.value) + ' ether');
            console.log('    Data:          ' + (tx.data ? (tx.data.length / 2 - 1): 0) + ' bytes');
            console.log(tx);
            return getWalletPromise().then(function(wallet) {
                return wallet.sendTransaction(tx);
            });
        };

        resolve(fauxAccount);
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
