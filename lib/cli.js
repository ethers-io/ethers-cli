'use strict';
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var ethers_1 = require("ethers");
var INFINITY = 0xffffffffff;
var WrappedSigner = /** @class */ (function (_super) {
    __extends(WrappedSigner, _super);
    function WrappedSigner(signer, opts) {
        var _this = _super.call(this) || this;
        _this._provider = signer.provider;
        _this._getAddress = signer.getAddress.bind(signer);
        _this._signMessage = signer.signMessage.bind(signer);
        _this._sendTransaction = signer.sendTransaction.bind(signer);
        _this._alwaysYes = !!opts.options.yes;
        _this._opts = opts;
        if (opts.options.nonce != INFINITY) {
            _this._nonce = Promise.resolve(opts.options.nonce);
        }
        return _this;
    }
    Object.defineProperty(WrappedSigner.prototype, "provider", {
        get: function () { return this._provider; },
        enumerable: true,
        configurable: true
    });
    WrappedSigner.prototype.getAddress = function () {
        return this._getAddress();
    };
    WrappedSigner.prototype.signMessage = function (message) {
        var _this = this;
        console.log('Message:');
        if (typeof (message) === 'string') {
            console.log('   Length:      ' + message.length);
            console.log('   Byte Length: ' + ethers_1.utils.toUtf8Bytes(message).length);
            console.log('   String:      ' + JSON.stringify(message), "(excluding outer quotes)");
            console.log('   Hex:         ' + ethers_1.utils.hexlify(ethers_1.utils.toUtf8Bytes(message)));
        }
        else {
            console.log('   Byte Length: ' + message.length);
            console.log('   Hex:         ' + ethers_1.utils.hexlify(message));
        }
        if (this._alwaysYes) {
            return this._signMessage(message);
        }
        return getPrompt("Sign Message? [y/n/a] ", { choice: ['y', 'n', 'a'] }).then(function (password) {
            if (password === 'n') {
                throw new Error('cancelled');
            }
            if (password === 'a') {
                _this._alwaysYes = true;
            }
            return _this._signMessage(message).then(function (signature) {
                var sig = ethers_1.utils.splitSignature(signature);
                console.log('Signature:');
                console.log('   Hex:           ', signature);
                console.log('   r:             ', sig.r);
                console.log('   s:             ', sig.s);
                console.log('   v:             ', sig.v);
                console.log('   Recovery Param:', sig.recoveryParam);
                return signature;
            });
        }).catch(function (error) {
            throw error;
        });
    };
    WrappedSigner.prototype.sendTransaction = function (transaction) {
        var _this = this;
        var tx = ethers_1.utils.shallowCopy(transaction);
        if (this._opts.gasPrice != null) {
            tx.gasPrice = this._opts.gasPrice;
        }
        else {
            tx.gasLimit = this._opts.provider.getGasPrice();
        }
        if (this._opts.options['gas-limit'] != null) {
            tx.gasLimit = this._opts.options['gas-limit'];
        }
        else if (tx.gasLimit == null) {
            var estimate = ethers_1.utils.shallowCopy(tx);
            estimate.from = this.getAddress();
            tx.gasLimit = this.provider.estimateGas(tx);
        }
        if (tx.nonce == null && this._nonce) {
            tx.nonce = this._nonce;
        }
        else {
            tx.nonce = this.provider.getTransactionCount(this.getAddress());
        }
        if (tx.data == null && this._opts.options.data) {
            tx.data = this._opts.options.data;
        }
        if (tx.value == null && this._opts.options.value) {
            tx.value = this._opts.options.value;
        }
        return ethers_1.utils.resolveProperties(tx).then(function (tx) {
            console.log('Transaction:');
            console.log('  To:          ', tx.to);
            console.log('  Gas Price:   ', ethers_1.utils.formatUnits(tx.gasPrice, 'gwei'), 'gwei');
            console.log('  gas Limit:   ', tx.gasLimit.toNumber());
            console.log('  Nonce:       ', tx.nonce);
            console.log('  Data:        ', ethers_1.utils.hexlify(tx.data || '0x'));
            console.log('  Value:       ', ethers_1.utils.commify(ethers_1.utils.formatEther(tx.value)), 'ether');
            var sendTransaction = function () {
                var sendPromise = _this._sendTransaction(tx);
                _this._nonce = sendPromise.then(function (tx) {
                    return tx.nonce + 1;
                });
                return sendPromise.then(function (tx) {
                    console.log('Sent Transaction:');
                    console.log('   Hash:       ', tx.hash);
                    return tx;
                });
            };
            if (_this._alwaysYes) {
                return sendTransaction();
            }
            return getPrompt("Sign and Trasmit? [y/n/a] ", { choice: ['y', 'n', 'a'] }).then(function (password) {
                if (password === 'n') {
                    throw new Error('cancelled');
                }
                if (password === 'a') {
                    _this._alwaysYes = true;
                }
                return sendTransaction();
            }).catch(function (error) {
                throw error;
            });
        });
    };
    return WrappedSigner;
}(ethers_1.Signer));
function repeat(c, count) {
    var result = '';
    while (result.length < count) {
        result += c;
    }
    return result;
}
function _getPrompt(prompt, options, callback) {
    process.stdout.write(prompt);
    var stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    var password = '';
    var respond = function (ctrlC, password) {
        process.stdout.write('\n');
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', handler);
        callback(ctrlC, password);
    };
    function handler(ch) {
        ch = String(ch);
        switch (ch) {
            case "\n":
            case "\r":
            case "\u0004":
                // They've finished typing their password
                respond(false, password);
                break;
            case "\u007f":
                if (password.length > 0 && options.choice == null) {
                    password = password.substring(0, password.length - 1);
                    (process.stdout).clearLine();
                    (process.stdout).cursorTo(0);
                    if (options.mask) {
                        process.stdout.write(prompt + repeat(options.mask, password.length));
                    }
                    else {
                        process.stdout.write(prompt + password);
                    }
                }
                break;
            case "\u0003":
                // Ctrl-C
                process.stdout.write('\n[ CTRL-C ]');
                respond(true, null);
                break;
            default:
                if (options.choice) {
                    if (options.choice.indexOf(ch) >= 0) {
                        process.stdout.write(ch);
                        respond(false, ch);
                    }
                }
                else {
                    // More passsword characters
                    process.stdout.write('*');
                    password += ch;
                }
                break;
        }
    }
    stdin.on('data', handler);
}
function getProgressBar(action) {
    var lastProgress = -1;
    return function (percent) {
        var progress = Math.trunc(percent * 100);
        if (progress == lastProgress) {
            return;
        }
        lastProgress = progress;
        process.stdin.setRawMode(false);
        process.stdin.pause();
        (process.stdout).clearLine();
        (process.stdout).cursorTo(0);
        process.stdout.write(action + "... " + progress + "%");
        if (percent === 1) {
            process.stdout.write('\n');
        }
    };
}
exports.getProgressBar = getProgressBar;
function getPrompt(prompt, options) {
    if (!options) {
        options = {};
    }
    return new Promise(function (resolve, reject) {
        _getPrompt(prompt, options, function (ctrlC, password) {
            if (ctrlC) {
                reject(new Error('cancelled'));
            }
            else {
                resolve(password);
            }
        });
    });
}
exports.getPrompt = getPrompt;
function openJsonSigner(filename) {
    var json = null;
    function decryptJson(opts, index) {
        var address = ethers_1.utils.getJsonWalletAddress(json);
        return getPrompt("Password (" + address + "): ", { mask: '*' }).then(function (password) {
            return ethers_1.Wallet.fromEncryptedJson(json, password, getProgressBar('Decrypting')).then(function (account) {
                console.log("Account #" + index + ": " + address);
                return new WrappedSigner(account.connect(opts.provider), opts);
            });
        });
    }
    ;
    if (filename === '-') {
        return function (opts, index) {
            return getPrompt("JSON/Mnemonic/Raw: ", { mask: '*' }).then(function (password) {
                password = password.trim();
                if (ethers_1.utils.getJsonWalletAddress(password) != null) {
                    json = password;
                    return decryptJson(opts, index);
                }
                if (ethers_1.utils.hexDataLength(password) === 32) {
                    var wallet = new ethers_1.Wallet(password, opts.provider);
                    console.log("Account #" + index + ": " + wallet.address);
                    return new WrappedSigner(wallet, opts);
                }
                if (ethers_1.utils.HDNode.isValidMnemonic(password)) {
                    var wallet = ethers_1.Wallet.fromMnemonic(password).connect(opts.provider);
                    console.log("Account #" + index + ": " + wallet.address);
                    return new WrappedSigner(wallet, opts);
                }
                throw new Error('unknown data format for account');
                return null;
            });
        };
    }
    json = fs_1.default.readFileSync(filename).toString();
    return decryptJson;
}
function openLedgerSigner() {
    return function (opts) {
        return Promise.resolve(null);
    };
}
function openJsonRpcSigner(rpcProviders, addressOrIndex) {
    return function (opts) {
        if (typeof (addressOrIndex) === 'number') {
            return Promise.resolve(rpcProviders[0].getSigner(addressOrIndex));
        }
        else {
            var seq_1 = Promise.resolve(null);
            rpcProviders.forEach(function (provider) {
                seq_1 = seq_1.then(function (signer) {
                    if (signer) {
                        return signer;
                    }
                    return provider.listAccounts().then(function (accounts) {
                        if (accounts.indexOf(addressOrIndex) >= 0) {
                            return provider.getSigner(addressOrIndex);
                        }
                        return null;
                    });
                });
            });
            return seq_1;
        }
    };
}
function parseUnits(defaultValue, unit) {
    return function (value) {
        if (value === null) {
            value = defaultValue;
        }
        if (value === null) {
            return null;
        }
        return ethers_1.utils.parseUnits(value, unit);
    };
}
function integerOption(defaultValue) {
    return function (value, opts) {
        if (value == null) {
            return defaultValue;
        }
        var v = parseInt(value);
        if (parseInt(String(v)) != v) {
            throw new Error('invalid integer');
        }
        return v;
    };
}
exports.integerOption = integerOption;
var Plugin = /** @class */ (function () {
    function Plugin() {
    }
    return Plugin;
}());
exports.Plugin = Plugin;
var info = JSON.parse(fs_1.default.readFileSync(path_1.default.resolve(__dirname, '../package.json')).toString());
function showHelp(options, plugins, error) {
    var name = null;
    if (typeof (options._name) === 'string') {
        name = options._name;
    }
    else if (!name) {
        name = path_1.default.basename(process.argv[1]);
    }
    console.log(name + '/' + (options._version || info.version));
    console.log('Usage:');
    console.log('');
    var extra = {};
    var commands = Object.keys(plugins);
    if (commands.length) {
        commands.forEach(function (command) {
            var plugin = plugins[command];
            if (plugin.options) {
                for (var p in plugin.options) {
                    extra[p] = plugin.options[p];
                }
            }
            console.log('   ' + name + ' ' + command + ' ' + plugin.help);
        });
        console.log('');
    }
    if (options._accounts) {
        console.log('Account Options');
        console.log('   --account FILENAME     load account from a JSON wallet');
        console.log('   --account-rpc ACCOUNT  use ACCOUNT (address or index) from node');
        console.log('');
    }
    if (options._provider) {
        console.log('Provider Options');
        console.log('   --rpc URL              connect to the node at URL');
        console.log('   --etherscan            connect to Etherscan');
        console.log('   --infura               connect to INFURA');
        console.log('   --network NETWORK      connect to NETWORK (default: homestead)');
        console.log('');
    }
    if (options._transaction) {
        console.log('Transaction Options');
        console.log('   --data DATA            data to include in transaction');
        console.log('   --gas-price GWEI       gas price to include in transaction');
        console.log('   --gas-limit LIMIT      gas limit to include in transaction');
        console.log('   --nonce NONCE          nocne to include in transaction');
        console.log('   --value WEI            value to include in transaction');
        console.log('   --yes                  answer "yes" to all signing requests');
        console.log('');
    }
    if (Object.keys(extra).length) {
        console.log('Command Options');
        for (var p in extra) {
            console.log('   --' + p + repeat(' ', 20 - p.length) + extra[p]);
        }
        console.log('');
    }
    console.log('General Options');
    console.log('   --help                 show this help');
    console.log('   --version              show the version');
    console.log('   --debug                enable debugging');
    console.log('');
    if (error) {
        console.log(error);
        console.log('');
    }
}
function showVersion(options) {
    var name = null;
    if (typeof (options.name) === 'string') {
        name = options.name;
    }
    else if (!name) {
        name = path_1.default.basename(process.argv[1]);
    }
    console.log((options._name || info.name) + '/' + (options._version || info.version));
}
function run(options, plugins, argv) {
    if (!argv) {
        argv = process.argv.slice(2);
    }
    var _showHelp = function (error) {
        showHelp(options, plugins, error);
    };
    options = ethers_1.utils.shallowCopy(options);
    options.help = false;
    options.version = false;
    options.debug = false;
    var opts = {
        args: [],
        options: {},
        accounts: [],
        provider: null,
        network: null,
        gasPrice: null,
        showHelp: _showHelp,
    };
    var accountCalls = [];
    if (options._accounts) {
        options.account = [];
        options['account-rpc'] = [];
        options.ledger = false;
    }
    var rpcProviders = [];
    if (options._provider) {
        options.etherscan = false;
        options.infura = false;
        options.network = '';
        options.rpc = [''];
        opts.provider = null;
    }
    if (options._transaction) {
        options['nonce'] = integerOption(INFINITY);
        options['data'] = '0x';
        options['gas-limit'] = parseUnits(null, 0);
        options['gas-price'] = parseUnits(null, 9);
        options['value'] = parseUnits("0.0", 18);
        options['yes'] = false;
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
        if (options._accounts && key === 'ledger') {
            accountCalls.push(openLedgerSigner());
            continue;
        }
        // Specified an option that is treated as a flag (no additional value)
        if (typeof (options[key]) === 'boolean') {
            opts.options[key] = !options[key];
            continue;
        }
        // Specified an option we don't support
        if (options[key] == undefined) {
            throw new Error('unknown option: --' + key);
        }
        // Read (and consume) the next value
        var value = argv[++i];
        // Last entry was a keyword option
        if (value === undefined) {
            throw new Error('missing value for option: ' + key);
        }
        if (options._accounts && key === 'account') {
            accountCalls.push(openJsonSigner(String(value)));
        }
        else if (options._accounts && key === 'account-rpc') {
            if (value.match(/^[0-9]+$/)) {
                accountCalls.push(openJsonRpcSigner(rpcProviders, parseInt(value)));
            }
            else {
                accountCalls.push(openJsonRpcSigner(rpcProviders, ethers_1.utils.getAddress(value)));
            }
        }
        else if (Array.isArray(options[key])) {
            if (!opts.options[key]) {
                opts.options[key] = [];
            }
            opts.options[key].push(value);
        }
        else {
            if (opts.options[key] != null) {
                throw new Error('duplicate value for key ' + key);
            }
            opts.options[key] = value;
        }
    }
    if (options._provider) {
        var network_1 = opts.options.network || undefined;
        if (network_1 != null && network_1.match(/^[0-9]+$/)) {
            network_1 = ethers_1.utils.getNetwork(parseInt(opts.options.network));
        }
        else if (network_1 && network_1.match(/^[A-Za-z0-9]+$/)) {
            network_1 = ethers_1.utils.getNetwork(opts.options.network);
        }
        else if (network_1) {
            try {
                var n = JSON.parse(network_1);
                if (typeof (n.chainId) === 'number') {
                    network_1 = n;
                }
            }
            catch (error) {
                console.log(error);
            }
        }
        var providerList_1 = [];
        if (opts.options.etherscan) {
            providerList_1.push(new ethers_1.providers.EtherscanProvider(network_1));
        }
        if (opts.options.infura) {
            providerList_1.push(new ethers_1.providers.InfuraProvider(network_1));
        }
        if (opts.options.rpc && Array.isArray(opts.options.rpc)) {
            opts.options.rpc.forEach(function (rpc) {
                var provider = null;
                if (rpc.match(/^https?:/)) {
                    provider = new ethers_1.providers.JsonRpcProvider(rpc, network_1);
                }
                else {
                    provider = new ethers_1.providers.IpcProvider(rpc, network_1);
                }
                providerList_1.push(provider);
                rpcProviders.push((provider));
            });
        }
        if (providerList_1.length === 0) {
            opts.provider = ethers_1.getDefaultProvider(network_1);
        }
        else if (providerList_1.length === 1) {
            opts.provider = providerList_1[0];
        }
        else {
            opts.provider = new ethers_1.providers.FallbackProvider(providerList_1);
        }
        seq = seq.then(function () {
            return opts.provider.getNetwork().then(function (network) {
                opts.network = network;
                return null;
            });
        });
    }
    seq = seq.then(function () {
        if (opts.options['gas-price']) {
            opts.gasPrice = opts.options['gas-price'];
        }
        else if (opts.provider) {
            return opts.provider.getGasPrice().then(function (gasPrice) {
                opts.gasPrice = gasPrice;
                return null;
            });
        }
        return null;
    });
    if (options._accounts && !opts.options.help) {
        // Provider is ready
        seq = seq.then(function () {
            // Get the accounts
            var seq = Promise.resolve();
            accountCalls.forEach(function (openAccount, index) {
                seq = seq.then(function () {
                    return openAccount(opts, index).then(function (account) {
                        opts.accounts.push(account);
                    });
                });
            });
            return seq.then(function () { return null; });
        });
    }
    // Populate the default values and run functions
    Object.keys(options).forEach(function (key) {
        if (opts.options[key] === undefined) {
            if (typeof (options[key]) === 'function') {
                opts.options[key] = (options[key])(null, opts);
            }
            else if (Array.isArray(options[key])) {
                opts.options[key] = [];
            }
            else {
                opts.options[key] = options[key];
            }
        }
        else if (typeof (options[key]) === 'function') {
            opts.options[key] = options[key](opts.options[key], opts);
        }
        else if (Array.isArray(options[key])) {
            var func_1 = (options[key])[0];
            if (typeof (func_1) === 'function') {
                opts.options[key] = (opts.options[key]).map(function (value) {
                    return func_1(value, opts);
                });
            }
        }
    });
    seq = seq.then(function () {
        if (opts.options.nonce !== INFINITY && opts.accounts.length > 1) {
            console.log('WARNING: Specifying --nonce with multiple accounts sets EVERY accounts first nonce.');
        }
        return null;
    });
    return seq.then(function () {
        var plugin = null;
        if (opts.options.help) {
            return _showHelp();
        }
        if (opts.options.version) {
            return showVersion(options);
        }
        if (opts.args.length) {
            plugin = plugins[opts.args[0]];
            if (!plugin) {
                plugin = plugins['*'];
            }
            if (!plugin) {
                return _showHelp('unknown command: ' + opts.args[0]);
            }
        }
        else {
            plugin = plugins[''];
            if (!plugin) {
                return _showHelp('missing command');
            }
        }
        return plugin.prepare(opts).then(function () {
            return plugin.run().catch(function (error) {
                if (opts.options.debug) {
                    console.log(error);
                }
                else {
                    if (error.message === 'cancelled') {
                        console.log('Cancelled');
                    }
                    else {
                        console.log('Error: ' + error.message);
                    }
                }
            }).then(function () {
                return null;
            });
        });
    }).catch(function (error) {
        if (error.message === 'cancelled') {
            console.log('Cancelled');
        }
        else {
            return _showHelp('Error: ' + error.message);
        }
    });
}
exports.run = run;
