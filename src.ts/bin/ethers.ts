#!/usr/bin/env node

'use strict';

import fs from 'fs';
import REPL from 'repl';
import util from 'util';
import vm from 'vm';

import { ethers } from 'ethers';

import { getProgressBar, getPrompt, Opts, Plugin, run } from '../lib/cli';

let options: any = {
    _accounts: true,
    _provider: true,
    _transaction: true,
    _name: 'ethers',
};

let plugins: { [command: string]: Plugin } = { };

function setupContext(context: any, opts: Opts) {
    context.provider = opts.provider;
    context.accounts = opts.accounts;

    if (!context.console) { context.console = console; }
    if (!context.require) { context.require = require; }

    context.ethers = ethers;
    context.version = ethers.version;

    context.Contract = ethers.Contract;
    context.ContractFactory = ethers.ContractFactory;
    context.Wallet = ethers.Wallet;

    context.getNetwork = ethers.utils.getNetwork;

    context.providers = ethers.providers;
    context.utils = ethers.utils;

    context.abiCoder = ethers.utils.defaultAbiCoder;
    context.parseSignature = ethers.utils.parseSignature;
    context.formatSignature = ethers.utils.formatSignature;

    context.BN = ethers.utils.bigNumberify;
    context.bigNumberify = ethers.utils.bigNumberify;

    context.getAddress = ethers.utils.getAddress;
    context.getContractAddress = ethers.utils.getContractAddress;
    context.getIcapAddress = ethers.utils.getIcapAddress;

    context.arrayify = ethers.utils.arrayify;
    context.hexlify = ethers.utils.hexlify;

    context.joinSignature = ethers.utils.joinSignature;
    context.splitSignature = ethers.utils.splitSignature;

    context.id = ethers.utils.id;
    context.keccak256 = ethers.utils.keccak256;
    context.namehash = ethers.utils.namehash;
    context.sha256 = ethers.utils.sha256;

    context.parseEther = ethers.utils.parseEther;
    context.parseUnits = ethers.utils.parseUnits;
    context.formatEther = ethers.utils.formatEther;
    context.formatUnits = ethers.utils.formatUnits;

    context.randomBytes = ethers.utils.randomBytes;

    context.constants = ethers.constants;

    context.parseTransaction = ethers.utils.parseTransaction;
    context.serializeTransaction = ethers.utils.serializeTransaction;

    context.toUtf8Bytes = ethers.utils.toUtf8Bytes;
    context.toUtf8String = ethers.utils.toUtf8String;
}

class SandboxPlugin extends Plugin {
    help = "";

    private opts: Opts;
    private _network: string;

    async prepare(opts: Opts): Promise<void> {
        this.opts = opts;
        let network = await this.opts.provider.getNetwork();
        this._network = (network.name || 'unknown');
    }

    run(): Promise<void> {
        let opts = this.opts;

        console.log('network: ' + this._network + ' (chainId: ' + opts.provider.network.chainId + ')');

        let nextPromiseId = 0;
        function promiseWriter(output: any): string {
            if (output instanceof Promise) {
                repl.context._p = output;
                let promiseId = nextPromiseId++;
                output.then((result) => {
                    console.log('\n<Promise id=' + promiseId + ' resolved>');
                    console.log(util.inspect(result));
                    repl.displayPrompt(true)
                }, (error) => {
                    console.log('\n<Promise id=' + promiseId + ' rejected>');
                    console.log(util.inspect(error));
                    repl.displayPrompt(true)
                });
                return '<Promise id=' + promiseId + ' pending>'
            }
            return util.inspect(output);
        }

        let repl = REPL.start({
            input: process.stdin,
            output: process.stdout,
            prompt: (opts.provider ? opts.provider.network.name: "no-network") + '> ',
            writer: promiseWriter
        });

        setupContext(repl.context, opts);

        return new Promise(function(resolve, reject) {
            repl.on('exit', function() {
                console.log('');
                resolve(null);
            });
        });
    }
}
plugins[''] = new SandboxPlugin();

class InitPlugin extends Plugin {
    help = "FILENAME";

    private filename: string;

    async prepare(opts: Opts): Promise<void> {
        if (opts.args.length < 2) {
            throw new Error('init requires FILENAME');
        }

        this.filename = opts.args[1];

        return null;
    }

    async run(): Promise<void> {
        if (fs.existsSync(this.filename)) {
            console.log('File already exists; cannot overwrite');
            return null;
        }

        console.log("Creating a new JSON Wallet - " + this.filename);
        console.log('Keep this password and file SAFE!! If lost or forgotten');
        console.log('it CANNOT be recovered, by ANYone, EVER.');

        return getPrompt("Choose a Password: ", { mask: '*' }).then((password) => {
            return getPrompt("Confirm Password:  ", { mask: '*' }).then((confirmPassword) => {
                if (password !== confirmPassword) {
                    throw new Error('passwords did not match');
                }

                let wallet = ethers.Wallet.createRandom();

                wallet.encrypt(password, { }, getProgressBar('Encrypting')).then((json) => {
                    try {
                        fs.writeFileSync(this.filename, json, { flag: 'wx' });
                        console.log('New account address: ' + wallet.address);
                        console.log('Saved:               ' + this.filename);
                    } catch (error) {
                        if (error.code === 'EEXIST') {
                            console.log('Filename already exists; cannot overwrite');
                        } else {
                            console.log('Unknown Error: ' + error.message);
                        }
                    }
                });
            });
        });
    }
}
plugins['init'] = new InitPlugin();

class InfoPlugin extends Plugin {
    help = "[ FILENAME_OR_ADDRESS_OR_NAME ]";

    private opts: Opts;
    private query: string;
    private address: string;

    async prepare(opts: Opts): Promise<void> {
        this.opts = opts;

        if (opts.accounts.length) {
            return opts.accounts[0].getAddress().then((address) => {
                this.address = address;
                this.query = 'Account:';
            });
        }

        if (opts.args.length === 2) {
            try {
                this.address = ethers.utils.getAddress(opts.args[1]);
                this.query = 'Address: ' + this.address;
                return null;
            } catch (error) { }

            if (opts.args[1].match(/\.eth$/)) {
                return opts.provider.resolveName(opts.args[1]).then((address) => {
                    this.address = address;
                    this.query = 'Name: ' + opts.args[1];
                    return null;
                });
            }

            this.address = ethers.utils.getJsonWalletAddress(fs.readFileSync(opts.args[1]).toString());
            this.query = 'File: ' + opts.args[1];
            return null;
        }

        return null;
    }

    async run(): Promise<void> {
        if (!this.address) { throw new Error('info requires an account or FILENAME'); }
        console.log(this.query);
        console.log('  Address:            ', this.address);
        let balance = await this.opts.provider.getBalance(this.address);
        console.log('  Balance:            ', ethers.utils.formatEther(balance));
        let nonce = await this.opts.provider.getTransactionCount(this.address);
        console.log('  Transaction Count:  ', nonce);
        let code = await this.opts.provider.getCode(this.address);
        if (code != '0x') {
            console.log('  Code:               ', code);
        }
        let reverse = await this.opts.provider.lookupAddress(this.address);
        if (reverse) {
            console.log('  Reverse Lookup:     ', reverse);
        }
    }
}
plugins['info'] = new InfoPlugin();

class SendPlugin extends Plugin {
    help = "TO_ADDRESS ETHER";

    private account: ethers.Signer;
    private provider: ethers.providers.Provider;
    private targetAddress: string;
    private amount: ethers.utils.BigNumber;

    prepare(opts: Opts): Promise<void> {
        this.account = opts.accounts[0];
        if (!this.account) { throw new Error('send requires an account'); }

        if (opts.args.length < 3) {
            throw new Error('send requires TO_ADDRESS and ETHER');
        }

        this.provider = opts.provider;
        this.amount = ethers.utils.parseEther(opts.args[2]);
        this.targetAddress = opts.args[1];

        return Promise.resolve(null);
    }

    async run(): Promise<void> {
        let address = this.provider.resolveName(this.targetAddress);
        if (address == null) { throw new Error('unknown ENS name: ' + this.targetAddress); }

        await this.account.sendTransaction({
             to: address,
             value: this.amount
        });

        return null;
    }
}
plugins['send'] = new SendPlugin();

class SweepPlugin extends Plugin {
    help = "TO_ADDRESS";

    private provider: ethers.providers.Provider;
    private account: ethers.Signer;
    private targetAddress: string;
    private gasPrice: ethers.utils.BigNumber;

    prepare(opts: Opts): Promise<void> {
        this.provider = opts.provider;
        this.gasPrice = opts.gasPrice;

        this.account = opts.accounts[0];
        if (!this.account) { throw new Error('sweep requires an account'); }

        if (opts.args.length < 2) {
            throw new Error('sweep requires TO_ADDRESS');
        }

        this.targetAddress = opts.args[1];

        return Promise.resolve(null);
    }

    async run(): Promise<void> {

        let address = this.provider.resolveName(this.targetAddress);
        if (address == null) { throw new Error('unknown ENS name: ' + this.targetAddress); }

        // Check we are sending to an EOA
        let code = await this.provider.getCode(this.targetAddress);
        if (code !== '0x') { throw new Error('sweep cannot send to a contract'); }

        // Compute the amount to send
        let balance = await this.provider.getBalance(this.account.getAddress());
        let gasPrice = this.gasPrice;
        let maxSpendable = balance.sub(gasPrice.mul(21000));

        if (maxSpendable.lte(0)) {
            throw new Error('insufficient funds to sweep');
        }

        return this.account.sendTransaction({
            to: this.targetAddress,
            gasLimit: 21000,
            gasPrice: this.gasPrice,
            value: maxSpendable
        }).then((tx: ethers.providers.TransactionResponse) => {
            return null;
        });
    }
}
plugins['sweep'] = new SweepPlugin();

class SignMessagePlugin extends Plugin {
    help = "MESSAGE [ --hex ]"

    options = { hex: 'treat strings as hex strings' };

    private account: ethers.Signer;
    private message: ethers.utils.Arrayish;

    prepare(opts: Opts): Promise<void> {
        this.account = opts.accounts[0];
        if (!this.account) { throw new Error('sign-message requires an account'); }

        if (opts.args.length < 2) {
            throw new Error('sign-message requires MESSAGE');
        }

        this.message = opts.args[1];
        if (opts.options.hex) {
            this.message = ethers.utils.arrayify(this.message);
        }

        return Promise.resolve();
    }

    async run(): Promise<void> {
        this.account.signMessage(this.message);
        return null;
    }
}
options['hex'] = false;
plugins['sign-message'] = new SignMessagePlugin();

class EvalPlugin extends Plugin {
    help = "SCRIPT"

    private script: string;
    private context: any;

    prepare(opts: Opts): Promise<void> {
        if (opts.args.length != 2) {
            throw new Error('eval requires SCRIPT');
        }

        this.script = opts.args[1];

        this.context = {};
        setupContext(this.context, opts);

        return Promise.resolve();
    }

    async run(): Promise<void> {
        let context = vm.createContext(this.context);
        let script = new vm.Script(this.script, { filename: '-' });

        let result = script.runInContext(context);
        if (!(result instanceof Promise)) {
            result = Promise.resolve(result);
        }

        return result.then((result: any) => {
            console.log(result);
        });
    }
}
plugins['eval'] = new EvalPlugin();


class RunPlugin extends Plugin {
    help = "FILENAME_JS"

    private filename: string;
    private context: any;

    prepare(opts: Opts): Promise<void> {
        if (opts.args.length != 2) {
            throw new Error('run requires FILENAME_JS');
        }

        this.filename = opts.args[1];

        this.context = {};
        setupContext(this.context, opts);

        return Promise.resolve();
    }

    async run(): Promise<void> {
        let context = vm.createContext(this.context);
        let script = new vm.Script(fs.readFileSync(this.filename).toString(), { filename: this.filename });

        let result = script.runInContext(context);
        if (!(result instanceof Promise)) {
            result = Promise.resolve(result);
        }

        return result.then((result: any) => {
            console.log(result);
        });
    }
}
plugins['run'] = new RunPlugin();

class WaitPlugin extends Plugin {
    help = "HASH";

    private provider: ethers.providers.Provider;
    private hash: string;

    prepare(opts: Opts): Promise<void> {
        this.provider = opts.provider;

        if (opts.args.length !== 2) {
            throw new Error('wait requires HASH');
        }

        this.hash = opts.args[1];

        return Promise.resolve(null);
    }

    async run(): Promise<void> {
        console.log("Waiting for Transaction:", this.hash);
        this.provider.waitForTransaction(this.hash).then((receipt) => {
            console.log("  Block:     ", receipt.blockNumber);
            console.log("  Block Hash:", receipt.blockHash);
            console.log("  Status:    ", (receipt.status ? "ok": "failed"));
        });

    }
}
plugins['wait'] = new WaitPlugin();

run(options, plugins);
