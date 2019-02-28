'use strict';

import fs from 'fs';
import path from 'path';

import { getDefaultProvider, providers, Signer, Wallet, utils } from 'ethers';

import {
    Arrayish
} from 'ethers/utils';

import {
    TransactionRequest,
    TransactionResponse
} from 'ethers/providers';


const NONCE_INFINITY = 0xffffffffff;


class WrappedSigner extends Signer {
    private _getAddress: () => Promise<string>;
    private _signMessage: (message: Arrayish | string) => Promise<string>;
    private _sendTransaction: (transaction: TransactionRequest) => Promise<TransactionResponse>;

    private _provider: providers.Provider;
    private _nonce: Promise<number>;
    private _opts: Opts;
    private _alwaysYes: boolean;

    constructor(signer: Signer, opts: Opts) {
        super();
        this._provider = signer.provider;
        this._getAddress = signer.getAddress.bind(signer);
        this._signMessage = signer.signMessage.bind(signer);
        this._sendTransaction = signer.sendTransaction.bind(signer);

        this._alwaysYes = !!opts.options.yes;

        this._opts = opts;
        if (opts.options.nonce != NONCE_INFINITY) {
            this._nonce = Promise.resolve(opts.options.nonce);
        }
    }

    get provider() { return this._provider; }

    getAddress(): Promise<string> {
        return this._getAddress();
    }

    signMessage(message: Arrayish | string): Promise<string> {
        console.log('Message:');

        if (typeof(message) === 'string') {
            console.log('   Length:      ' + message.length);
            console.log('   Byte Length: ' + utils.toUtf8Bytes(message).length);
            console.log('   String:      ' + JSON.stringify(message), "(excluding outer quotes)");
            console.log('   Hex:         ' + utils.hexlify(utils.toUtf8Bytes(message)));
        } else {
            console.log('   Byte Length: ' + message.length);
            console.log('   Hex:         ' + utils.hexlify(message));
        }

        if (this._alwaysYes) { return this._signMessage(message); }

        return getPrompt("Sign Message? [y/n/a] ", { choice: ['y', 'n', 'a'] }).then((password) => {
            if (password === 'n') {
                throw new Error('cancelled');
            }
            if (password === 'a') { this._alwaysYes = true; }

            return this._signMessage(message).then((signature) => {
                let sig = utils.splitSignature(signature);
                console.log('Signature:');
                console.log('   Hex:           ', signature);
                console.log('   r:             ', sig.r);
                console.log('   s:             ', sig.s);
                console.log('   v:             ', sig.v);
                console.log('   Recovery Param:', sig.recoveryParam);
                return signature;
            });

        }).catch((error) => {
            throw error;
        });

    }

    sendTransaction(transaction: TransactionRequest): Promise<TransactionResponse> {
        let tx = utils.shallowCopy(transaction);

        if (this._opts.gasPrice != null) {
            tx.gasPrice = this._opts.gasPrice;
        } else {
            tx.gasLimit = this._opts.provider.getGasPrice();
        }

        if (this._opts.options['gas-limit'] != null) {
            tx.gasLimit = this._opts.options['gas-limit'];
        } else if (tx.gasLimit == null) {
            let estimate = utils.shallowCopy(tx);
            estimate.from = this.getAddress();
            tx.gasLimit = this.provider.estimateGas(tx);
        }

        if (tx.nonce == null && this._nonce) {
            tx.nonce = this._nonce;
        } else {
            tx.nonce = this.provider.getTransactionCount(this.getAddress());
        }

        if (tx.data == null && this._opts.options.data) {
            tx.data = this._opts.options.data;
        }

        if (tx.value == null && this._opts.options.value) {
            tx.value = this._opts.options.value;
        }

        return utils.resolveProperties(tx).then((tx) => {
            console.log('Transaction:');
            console.log('  To:          ', tx.to);
            console.log('  Gas Price:   ', utils.formatUnits(tx.gasPrice, 'gwei'), 'gwei');
            console.log('  gas Limit:   ', tx.gasLimit.toNumber());
            console.log('  Nonce:       ', tx.nonce);
            console.log('  Data:        ', utils.hexlify(tx.data || '0x'));
            console.log('  Value:       ', utils.commify(utils.formatEther(tx.value)), 'ether');

            let sendTransaction = () => {
                let sendPromise = this._sendTransaction(tx);
                this._nonce = sendPromise.then((tx) => {
                    return tx.nonce + 1;
                });

                return sendPromise.then((tx) => {
                    console.log('Sent Transaction:');
                    console.log('   Hash:       ', tx.hash);
                    return tx;
                });
            }

            if (this._alwaysYes) { return sendTransaction(); }

            return getPrompt("Sign and Trasmit? [y/n/a] ", { choice: ['y', 'n', 'a'] }).then((password) => {
                if (password === 'n') {
                    throw new Error('cancelled');
                }
                if (password === 'a') { this._alwaysYes = true; }
                return sendTransaction();

            }).catch((error) => {
                throw error;
            });
        });
    }
}

function repeat(c: string, count: number): string {
    let result = '';
    while (result.length < count) { result += c; }
    return result;
}

function _getPrompt(prompt: string, options: PromptOptions, callback: (ctrlC: boolean, password: string) => void) {
    process.stdout.write(prompt);

    var stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    var password = '';

    let respond = (ctrlC: boolean, password: string) => {
        process.stdout.write('\n');
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', handler);
        callback(ctrlC, password);
    }

    function handler(ch: string): void {
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
                    (<any>(process.stdout)).clearLine();
                    (<any>(process.stdout)).cursorTo(0);
                    if (options.mask) {
                        process.stdout.write(prompt + repeat(options.mask, password.length));
                    } else {
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
                } else {
                    // More passsword characters
                    process.stdout.write('*');
                    password += ch;
                }
                break;
        }
    }
    stdin.on('data', handler);
}

export function getProgressBar(action: string): (percent: number) => void {
    let lastProgress = -1;
    return function(percent: number): void {
        let progress = Math.trunc(percent * 100);
        if (progress == lastProgress) { return; }
        lastProgress = progress;

        process.stdin.setRawMode(false);
        process.stdin.pause();

        (<any>(process.stdout)).clearLine();
        (<any>(process.stdout)).cursorTo(0);
        process.stdout.write(action + "... " + progress + "%");

        if (percent === 1) {
            process.stdout.write('\n');
        }
    }
}

export type PromptOptions = {
    choice?: Array<string>;
    mask?: string;
};

export function getPrompt(prompt: string, options?: PromptOptions): Promise<string> {
    if (!options) { options = {}; }
    return new Promise((resolve, reject) => {
        _getPrompt(prompt, options, (ctrlC, password) => {
            if (ctrlC) {
                reject(new Error('cancelled'));
            } else {
                resolve(password);
            }
        });
    });
}

function openJsonSigner(filename: string): (opts: Opts, index: number) => Promise<Signer> {
    let json: string = null;

    function decryptJson(opts: Opts, index: number): Promise<Signer> {
        let address: string = utils.getJsonWalletAddress(json);
        return getPrompt("Password (" + address + "): ", { mask: '*' }).then((password) => {
            return Wallet.fromEncryptedJson(json, password, getProgressBar('Decrypting')).then((account) => {
                console.log("Account #" + index + ": " + address);
                return new WrappedSigner(account.connect(opts.provider), opts);
            });
        });
    };

    if (filename === '-') {
        return function(opts: Opts, index: number): Promise<Signer> {
            return getPrompt("JSON/Mnemonic/Raw: ", { mask: '*' }).then((password) => {
                password = password.trim();
                if (utils.getJsonWalletAddress(password) != null) {
                    json = password;
                    return decryptJson(opts, index)
                }

                if (utils.hexDataLength(password) === 32) {
                    let wallet = new Wallet(password, opts.provider);
                    console.log("Account #" + index + ": " + wallet.address);
                    return new WrappedSigner(wallet, opts);
                }

                if (utils.HDNode.isValidMnemonic(password)) {
                    let wallet = Wallet.fromMnemonic(password).connect(opts.provider);
                    console.log("Account #" + index + ": " + wallet.address);
                    return new WrappedSigner(wallet, opts);
                }

                throw new Error('unknown data format for account');
                return null;
            });
        }
    }

    json = fs.readFileSync(filename).toString();
    return decryptJson;
}

function openLedgerSigner(): (opts: Opts) => Promise<Signer> {
    return function(opts: Opts) {
        return Promise.resolve(null);
    };
}

function openJsonRpcSigner(rpcProviders: Array<providers.JsonRpcProvider>, addressOrIndex: string | number): (opts: Opts) => Promise<providers.JsonRpcSigner> {
    return function(opts: Opts) {
        if (typeof(addressOrIndex) === 'number') {
            return Promise.resolve(rpcProviders[0].getSigner(addressOrIndex));
        } else {
            let seq = Promise.resolve(null);
            rpcProviders.forEach((provider) => {
                seq = seq.then((signer) => {
                    if (signer) { return signer; }
                    return provider.listAccounts().then((accounts) => {
                        if (accounts.indexOf(addressOrIndex) >= 0) {
                            return provider.getSigner(addressOrIndex);
                        }
                        return null;
                    });
                });
            });
            return seq;
        }
    };
}

function parseUnits(defaultValue: string, unit: string | number): (value: string) => utils.BigNumber {
    return function(value: string) {
        if (value === null) { value = defaultValue; }
        if (value === null) { return null; }
        return utils.parseUnits(value, unit);
    }
}

export interface Opts {
     args: Array<string>;
     accounts: Array<Signer>;
     options: { [key: string]: any };
     gasPrice: utils.BigNumber;
     network: utils.Network,
     provider: providers.BaseProvider;
     showHelp: (error?: string) => void;
}

export type OptionFunc = (value: string, opts: Opts) => any;

export type OptionType = OptionFunc | string | boolean;

export type Options = {
    [key: string]: Array<OptionType> | OptionType;
};

export function integerOption(defaultValue: number) {
    return function(value: string, opts: Opts) {
        if (value == null) { return defaultValue; }
        let v = parseInt(value);
        if (parseInt(String(v)) != v) { throw new Error('invalid integer'); }
        return v;
    }
}

export type Runner = () => Promise<any>;

export abstract class Plugin {
    help: string;
    options?: { [param: string]: string };
    abstract prepare(opts: Opts): Promise<void>
    abstract run(): Promise<void>;
}

let info = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json')).toString());

function showHelp(options: Options, plugins: { [command: string]: Plugin }, error: string) {

    let name: string = null;
    if (typeof(options._name) === 'string') {
        name = options._name;
    } else if (!name) {
        name = path.basename(process.argv[1]);
    }

    console.log(name + '/' + (options._version || info.version));
    console.log('Usage:');
    console.log('');

    let extra: { [param: string]: string } = {};

    let commands = Object.keys(plugins);
    if (commands.length) {
        commands.forEach((command) => {
            let plugin = plugins[command];
            if (plugin.options) {
                for (let p in plugin.options) {
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
        for (let p in extra) {
            console.log('   --' + p + repeat(' ', 20 - p.length) + extra[p])
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

function showVersion(options: Options) {
    let name: string = null;
    if (typeof(options.name) === 'string') {
        name = options.name;
    } else if (!name) {
        name = path.basename(process.argv[1]);
    }

    console.log((options._name || info.name) + '/' + (options._version || info.version));
}

export function run(options: Options, plugins: { [command: string]: Plugin }, argv?: Array<string>): Promise<Opts> {
    if (!argv) { argv = process.argv.slice(2); }

    let _showHelp = function(error?: string): void {
        showHelp(options, plugins, error);
    }

    options = utils.shallowCopy(options);
    options.help = false;
    options.version = false;
    options.debug = false;

    var opts: Opts = {
        args: [],
        options: { },

        accounts: [],
        provider: null,
        network: null,

        gasPrice: null,

        showHelp: _showHelp,
    }

    let accountCalls: Array<(opts: Opts, index: number) => Promise<Signer>> = [];
    if (options._accounts) {
        options.account = [];
        options['account-rpc'] = [];
        options.ledger = false;
    }

    let rpcProviders: Array<providers.JsonRpcProvider> = [];
    if (options._provider) {
        options.etherscan = false;
        options.infura = false;
        options.network = '';
        options.rpc = [ '' ];
        opts.provider = null;
    }

    if (options._transaction) {
        options['nonce'] = integerOption(NONCE_INFINITY);
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
        if (typeof(options[key]) === 'boolean') {
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

        } else if (options._accounts && key === 'account-rpc') {
            if (value.match(/^[0-9]+$/)) {
                accountCalls.push(openJsonRpcSigner(rpcProviders, parseInt(value)));
            } else {
                accountCalls.push(openJsonRpcSigner(rpcProviders, utils.getAddress(value)));
            }

        } else if (Array.isArray(options[key])) {
            if (!opts.options[key]) { opts.options[key] = []; }
            opts.options[key].push(value);

        } else {
            if (opts.options[key] != null) {
                throw new Error('duplicate value for key ' + key);
            }

            opts.options[key] = value;
        }
    }

    if (options._provider) {
        let network = opts.options.network || undefined;
        if (network != null && network.match(/^[0-9]+$/)) {
            network = utils.getNetwork(parseInt(opts.options.network));
        } else if (network && network.match(/^[A-Za-z0-9]+$/)) {
            network = utils.getNetwork(opts.options.network);
        } else if (network) {
            try {
                let n = JSON.parse(network);
                if (typeof(n.chainId) === 'number') {
                    network = n;
                }
            } catch (error) { console.log(error); }
        }

        let providerList: Array<providers.BaseProvider> = [];

        if (opts.options.etherscan) {
            providerList.push(new providers.EtherscanProvider(network));
        }

        if (opts.options.infura) {
            providerList.push(new providers.InfuraProvider(network));
        }

        if (opts.options.rpc && Array.isArray(opts.options.rpc)) {
            opts.options.rpc.forEach((rpc) => {
                let provider: providers.JsonRpcProvider = null;
                if (rpc.match(/^https?:/)) {
                    provider = new providers.JsonRpcProvider(rpc, network)
                } else {
                    provider = new providers.IpcProvider(rpc, network);
                }
                providerList.push(provider);
                rpcProviders.push((provider));
            });
        }

        if (providerList.length === 0) {
            opts.provider = getDefaultProvider(network);
        } else if (providerList.length === 1) {
            opts.provider = providerList[0];
        } else {
            opts.provider = new providers.FallbackProvider(providerList);
        }

        seq = seq.then(() => {
            return opts.provider.getNetwork().then((network) => {
                opts.network = network;
                return null;
            });
        });
    }

    seq = seq.then(() => {
        if (opts.options['gas-price']) {
            opts.gasPrice = opts.options['gas-price'];
        } else if (opts.provider) {
            return opts.provider.getGasPrice().then((gasPrice) => {
                opts.gasPrice = gasPrice;
                return null;
            });
        }
        return null;
    });

    if (options._accounts && !opts.options.help) {

        // Provider is ready
        seq = seq.then(() => {

            // Get the accounts
            let seq = Promise.resolve();
            accountCalls.forEach((openAccount, index) => {
                seq = seq.then(() => {
                    return openAccount(opts, index).then((account) => {
                        opts.accounts.push(account);
                    });
                });
            });

            return seq.then(() => null);
        });
    }

    // Populate the default values and run functions
    Object.keys(options).forEach(function(key) {
        if (opts.options[key] === undefined) {
            if (typeof(options[key]) === 'function') {
                opts.options[key] = (<OptionFunc>(options[key]))(null, opts);
            } else if (Array.isArray(options[key])) {
                opts.options[key] = [];
            } else {
                opts.options[key] = options[key];
            }

        } else if (typeof(options[key]) === 'function') {
            opts.options[key] = (<OptionFunc>options[key])(opts.options[key], opts);

        } else if (Array.isArray(options[key])) {
            let func = (<Array<OptionFunc>>(options[key]))[0];
            if (typeof(func) === 'function') {
                opts.options[key] = (<Array<string>>(opts.options[key])).map((value) => {
                    return func(value, opts);
                });
            }
        }
    });

    seq = seq.then(() => {
        if (opts.options.nonce !== NONCE_INFINITY && opts.accounts.length > 1) {
            console.log('WARNING: Specifying --nonce with multiple accounts sets EVERY accounts first nonce.');
        }
        return null;
    });

    return seq.then(() => {
        let plugin: Plugin = null;

        if (opts.options.help) { return _showHelp(); }
        if (opts.options.version) { return showVersion(options); }

        if (opts.args.length) {
            plugin = plugins[opts.args[0]];
            if (!plugin) {
                plugin = plugins['*'];
            }
            if (!plugin) {
                return _showHelp('unknown command: ' + opts.args[0]);
            }
        } else {
            plugin = plugins[''];
            if (!plugin) {
                return _showHelp('missing command');
            }
        }

        return plugin.prepare(opts).then(() => {
            return plugin.run().catch((error) => {
                if (opts.options.debug) {
                    console.log(error);
                } else {
                    if (error.message === 'cancelled') {
                        console.log('Cancelled');
                    } else {
                        console.log('Error: ' + error.message);
                    }
                }
            }).then(() => {
                return null;
            });
        });
    }).catch((error: Error) => {
        if (error.message === 'cancelled') {
            console.log('Cancelled');
        } else {
            return _showHelp('Error: ' + error.message);
        }
    });
}

