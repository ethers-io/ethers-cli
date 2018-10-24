#!/usr/bin/env node

'use strict';

import fs from 'fs';

import { ethers } from 'ethers';

import { Auction, ENS, ENSTransactionResponse, getDate, getDateTimer } from 'ethers-ens';

import { Opts, Plugin, run } from '../lib/cli';

function padded(char: string, length: number): string {
    let result = '';
    while (result.length < length) { result += char; }
    return result;
}

function getMaxBid(ops: Array<any>): string {
    let maxBidAmount = ethers.utils.bigNumberify(0);
    ops.forEach(function(op) {
        if (op.command !== 'placeBid') { return; }
        let bidAmount = ethers.utils.parseEther(op.bidAmount);
        if (bidAmount.gte(maxBidAmount)) {
            maxBidAmount = bidAmount;
        }
    });
    return ethers.utils.formatEther(maxBidAmount);
}

function getDeeds(ens: ENS, ops: Array<any>): Promise<Array<any>> {

    let deeds = ops.filter((op) => (op.command === 'placeBid')).map((op) => {
        if (op.sealedBid) { return Promise.resolve(op.sealedBid); }
        return ens.getBidHash(op.name, op.address, ethers.utils.parseEther(op.bidAmount), op.salt).then((sealedBid) => {
            return ens.getDeedAddress(op.address, sealedBid);
        }).then((deed) => {
            return {
                address: deed,
                bidAmount: op.bidAmount,
                sealedBid: op.sealedBid
            };
        });

    });

    return Promise.all(deeds);
}

function dumpInfo(header: string, result: Array<Array<any>>): void {
    if (header) {
        console.log(header);
    }

    let maxLength = 0;
    result.forEach((record) => {
        if (record[0].length > maxLength) { maxLength = record[0].length; }
    });
    result.forEach((record) => {
        let key = record[0];
        let value = record[1];
        if (value instanceof Date) { value = getDateTimer(value); }
        console.log('  ' + key + ':' + padded(' ', 3 + maxLength - key.length) + value);
    });
}

function dumpNameInfo(header: string, nameInfo: NameInfo): void {
    let result: Array<Array<any>> = [];
    if (nameInfo.state) {
        result.push([ 'State', nameInfo.state ]);
        result.push([ 'Available Start Date', getDateTimer(nameInfo.startDate) ]);
    }
    if (nameInfo.state == 'auction' || nameInfo.state == 'reveal' || nameInfo.state == '') {
        result.push([ 'Auction Reveal Date', getDateTimer(nameInfo.revealDate) ]);
        result.push([ 'Auction End Date', getDateTimer(nameInfo.endDate) ]);
    }
    if (nameInfo.state == 'reveal' || nameInfo.state == 'owned') {
        result.push([ 'Winning Deed', nameInfo.winningDeed ]);
        result.push([ 'Winning Bidder', nameInfo.winningBidder ]);
        result.push([ 'Value', nameInfo.value ]);
        result.push([ 'Highest Bid', nameInfo.highestBid ]);
    }
    if (nameInfo.state == 'owned' || !nameInfo.state) {
        result.push([ 'Owner', nameInfo.owner ]);
        result.push([ 'Resolver', nameInfo.resolver ]);
        result.push([ 'Address', nameInfo.addr ]);
        if (nameInfo.reverseName) {
            result.push([ 'Reverse Name', nameInfo.reverseName ]);
        }
        if (nameInfo.publicKey) {
            result.push([ 'Public Key', nameInfo.publicKey ]);
        }
        if (nameInfo.email) {
            result.push([ 'Email', nameInfo.email ]);
        }
        if (nameInfo.url) {
            result.push([ 'URL', nameInfo.url ]);
        }
    }
    return dumpInfo(header, result);
}

function addLog(opts: Opts, action: string, info: { [name: string]: any }): Promise<void> {
    info = ethers.utils.shallowCopy(info);

    return opts.provider.getNetwork().then((network) => {
        if (opts.options.nolog) { return; }

        info.network = network.name;

        // Prepare the log (action and date)
        let log = action + ' - ' + getDate(new Date()) + '\n';

        // Add each sorted key
        let keys = Object.keys(info);
        keys.sort();
        keys.forEach(function(key) {
            log += '  ' + key + ':' + padded(' ', 20 - key.length) + info[key] + '\n';
        });

        // Append it to the log
        fs.appendFileSync('ens-log.txt', log);
    });
}


function loadLog(network: string): Array<any> {
    let data = '';
    try {
        data = fs.readFileSync('ens-log.txt').toString();
    } catch (error) {
        // File doesn't exist, so no log to load
        if (error.code !== 'ENOENT') { throw error; }
    }

    let entries: Array<any> = [];
    let entry: any = {};
    data.split('\n').forEach(function(line) {
        if (line.substring(0, 1) === '#') { return; }
        if (line.substring(0, 2) === '  ') {
            let comps = line.split(/:/);
            entry[comps[0].trim()] = comps[1].trim();
        } else if (line.indexOf(' - ') >= 0) {
            entry = {};
            let comps = line.split(' - ');
            entry.command = comps[0];
            entry.date = comps[1];
            entries.push(entry);
        }
    });

    // Check chonologically for ignore/watch commands for the most recent stste
    let ignore: { [name: string]: boolean } = {};
    entries.forEach(function(entry) {
        if (entry.command === 'ignore') {
            ignore[entry.name] = true;
        } else if (entry.command === 'watch') {
            ignore[entry.name] = false;
        }
    });

    // Filter out entries we don't care about
    let filtered: Array<any> = [];
    entries.forEach(function(entry) {
        if (entry.network === 'testnet') { entry.network = 'ropsten'; }
        if (entry.network === 'mainnet') { entry.network = 'homestead'; }

        if (entry.network !== network) { return; }
        if (entry.command === 'ignore') { return; }
        if (ignore[entry.name]) { return; }
        filtered.push(entry);
    });

    return filtered;
}


interface PendingNameInfo {
    resolver: Promise<string>;
    owner: Promise<string>;
    addr: Promise<string>;
    publicKey?: Promise<string>;
    url?: Promise<string>;
    email?: Promise<string>;
    auction?: Promise<Auction>;
    startDate?: Promise<Date>;
}

interface NameInfo {
    resolver: string;
    owner: string;
    addr: string;
    name: string;
    publicKey?: string;
    url?: string;
    email?: string;
    startDate?: Date;
    endDate?: Date;
    highestBid?: string;
    revealDate?: Date;
    state?: string;
    value?: string;
    winningDeed?: string;
    winningBidder?: string;
    reverseName?: string;
}

/*
let InfoMapping = {
    addr: 'Address',
    email: 'E-mail Address',
    endDate: 'End Date',
    highestBid: 'Highest Bid',
    resolver: 'Resolver',
    revealDate: 'Reveal Date',
    name: 'Name',
    owner: 'Owner',
    startDate: 'Start Date',
    state: 'State',
    url: 'URL',
    value: 'Value',
    winningBidder: 'Winning Bidder',
    winningDeed: 'Winning Deed',
};
*/

function getNameInfo(ens: ENS, name: string, extra?: boolean): Promise<NameInfo> {

    let result: PendingNameInfo = {
        resolver: ens.getResolver(name),
        owner: ens.getOwner(name),
        addr: ens.getAddress(name),
    };

    if (extra) {
        result.publicKey = ens.getPublicKey(name);
        result.url = ens.getText(name, 'url');
        result.email = ens.getText(name, 'email');
    }

    if (name.match(/\.eth$/) && name.split('.').length === 2) {
        result.auction = ens.getAuction(name);
        result.startDate = ens.getAuctionStartDate(name);
    }

    return ethers.utils.resolveProperties(result).then((result) => {
        let nameInfo: NameInfo = {
            resolver: result.resolver,
            owner: result.owner,
            addr: result.addr,
            name: name,
        };

        if (result.publicKey) { nameInfo.publicKey = result.publicKey; }
        if (result.url) { nameInfo.url = result.url; }
        if (result.email) { nameInfo.email = result.email; }

        if (result.auction) {
            nameInfo.startDate = result.startDate;

            let auction: Auction = result.auction;
            nameInfo.state = auction.state;
            nameInfo.winningDeed = auction.winningDeed;
            nameInfo.endDate = auction.endDate;
            nameInfo.revealDate = auction.revealDate;
            nameInfo.value = ethers.utils.formatEther(auction.value);
            nameInfo.highestBid = ethers.utils.formatEther(auction.highestBid);
        }

        if (nameInfo.winningDeed && nameInfo.winningDeed !== ethers.constants.AddressZero) {
            return ens.getDeedOwner(nameInfo.winningDeed).then((deedOwner) => {
                nameInfo.winningBidder = deedOwner;
                return nameInfo;
            });
        }

        return nameInfo;
    });

/*
    return Promise.all(promises).then(function(result) {
        var nameInfo: NameInfo = {
            resolver: result[0],
            owner: result[1],
            addr: result[2],
            name: name
        };

        var index = 3;

        if (extra) {
            nameInfo.publicKey = result[index++];
            nameInfo.url = result[index++];
            nameInfo.email = result[index++];
        }

        if (isValidHashRegistrarName(name)) {
            var info = result[index++];
            ['endDate', 'highestBid', 'revealDate', 'state', 'value', 'winningDeed'].forEach(function(key) {
                nameInfo[key] = info[key];
            });
            nameInfo.startDate = result[index++];

            if (nameInfo.winningDeed !== '0x0000000000000000000000000000000000000000') {
                return ens.getDeedOwner(nameInfo.winningDeed).then(function(owner) {
                    nameInfo.winningBidder = owner;
                    return nameInfo;
                });
            }
        }

        return nameInfo;
    })
*/
}
/*
function expandKeys(value: any, mapping?: { [name: string]: string } ): Array<Array<string>> {
    if (!mapping) { mapping = { }; }

    let result = [];
    for (let key in value) {
        result.push([(mapping[key] || key), value[key]]);
    }

    return result;
}
*/
let options: any = {
    _accounts: true,
    _provider: true,
    _transaction: true,
    _name: 'ethers',
};

let plugins: { [command: string]: Plugin } = {};

class LookupPlugin extends Plugin {
    help = "NAME [ NAME ... ]"

    private ens: ENS;
    private names: Array<string>;

    prepare(opts: Opts): Promise<void> {
        if (opts.args.length < 2) {
            throw new Error('lookup requires at least one NAME');
        }

        this.ens = new ENS(opts.provider);
        this.names = opts.args.slice(1);

        return Promise.resolve();
    }

    async run(): Promise<void> {
        let seq = Promise.resolve();
        this.names.forEach((name) => {
            seq = seq.then(() => {
                try {
                    let address = ethers.utils.getAddress(name);
                    return this.ens.lookupAddress(name).then((name) => {
                        if (name) {
                            return getNameInfo(this.ens, name, true).then((nameInfo) => {
                                nameInfo.reverseName = name;
                                dumpNameInfo('Address: ' + address, nameInfo);
                                return null;
                            });
                        }
                        dumpInfo('Address: ' + address, [ ['Reverse Name Lookup', 'null' ] ]);
                        return null;
                    });
                } catch(error) { }

                return getNameInfo(this.ens, name, true).then((nameInfo) => {
                    dumpNameInfo('Name: ' + name, nameInfo)
                    return null;
                });
            });
        });

        return seq;
    }
}
plugins['lookup'] = new LookupPlugin();

class ScanLogPlugin extends Plugin {
    help = ""

    private ens: ENS;

    prepare(opts: Opts): Promise<void> {
        if (opts.args.length !== 1) {
            throw new Error('scan-log has no parameters');
        }

        this.ens = new ENS(opts.provider);

        return Promise.resolve();
    }

    async run(): Promise<void> {
        let network = await this.ens.provider.getNetwork();

        let logs = loadLog(network.name);

        let names: { [name: string]: {
            operations: Array<any>,
            name: string,
            log: any
        } } = { };

        logs.forEach((log) => {
            if (log.name) {
                if (!names[log.name]) {
                    names[log.name] = { operations: [], name: log.name, log: null };
                }
                names[log.name].operations.push(log);
             }
        });

        let results: Array<any> = [];
        for (let name in names) {
            if (!name.match(/\.eth$/) || name.split('.').length !== 2) { break; }

            let ops: Array<any> = names[name].operations || [];

            let auction = await this.ens.getAuction(name);

            let result: any = {
                date: auction.endDate,
                endDate: auction.endDate,
                name: name,
                state: auction.state,
                value: ethers.utils.formatEther(auction.value),
                winningBidAmount: ethers.utils.formatEther(auction.highestBid)
            };

            if (auction.state === 'open' || auction.state === 'not-yet-available') {
                result.date = await this.ens.getAuctionStartDate(name);
            }

            if (auction.state === 'owned') {
                result.owner = await this.ens.getOwner(name);
                let deedOwner = await this.ens.getDeedOwner(auction.winningDeed);
                result.winning = false;

                ops.forEach((op) => {
                    if (result.owner === op.address || deedOwner === op.address) {
                        result.winning = true;
                        result.bidAmount = result.winningBidAmount;
                    }
                });

                if (!result.winning) {
                    result.bidAmount = getMaxBid(ops);
                }
            }

            if (auction.state === 'auction') {
                result.date = result.revealDate;
                result.bidAmount = getMaxBid(ops);

                let deeds = await getDeeds(this.ens, ops);
                result.deedAddresses = deeds.map((deed) => deed.address);
            }

            if (auction.state === 'reveal') {
                if (auction.winningDeed !== ethers.constants.AddressZero) {
                    result.winning = false;
                    let deedOwner = await this.ens.getDeedOwner(auction.winningDeed);
                    ops.forEach((op) => {
                        if (op.address === deedOwner) {
                            result.winning = true;
                            result.bidAmount = op.bidAmount;
                        }
                    });
                    if (!result.winning) {
                        result.bidAmount = getMaxBid(ops);
                    }
                } else {
                    result.bidAmount = getMaxBid(ops);
                }
            }

            results.push(result);
        }

        results.sort(function(a: any, b: any): number {
            if (a.state === 'not-yet-available') {
                if (b.state === 'open') { return -1; }
                if (a.state === b.state) { return (a.date.getTime() - b.date.getTime()); }
            } else if (a.state === 'open') {
                if (b.state === 'not-yet-available') { return 1; }
                if (a.state === b.state) { return (a.date.getTime() - b.date.getTime()); }
            }
            return a.endDate.getTime() - b.endDate.getTime();
        });


        let warnings: Array<string> = [];
        let lastState: string = null;

        results.forEach((result) => {
            if (result.state !== lastState) {
                console.log(result.state);
                lastState = result.state;
            }

            let dateInfo = getDateTimer(result.date);

            let warn = false;
            if (result.state === 'auction' && result.deedAddresses) {
                result.deedAddresses.forEach((address: string) => {
                    if (address !== ethers.constants.AddressZero) { return; }
                    warnings.push('placeBid(' + result.name + ', ' + result.bidAmount + ') is missing on the blockchain');
                    warn = true;
                });
            }

            if (result.state === 'reveal' && result.deedAddresses) {
                result.deedAddresses.forEach((address: string) => {
                    if (address === ethers.constants.AddressZero) { return; }
                    warnings.push('revealBid(' + result.name + ', ' + result.bidAmount + ') has not been called');
                    warn = true;
                });
            }

            if (result.state === 'owned' && result.owner === ethers.constants.AddressZero && result.winning) {
                warnings.push('finalizeAuction(' + result.name + ') has not been called');
                warn = true;
            }

            let bidInfo = ' ';
            bidInfo += (warn ? '!! ': '   ');
            bidInfo += (result.winning ? '* ': '  ');

            if (result.state === 'auction' && result.bidAmount !== '0.0') {
                bidInfo += result.bidAmount;
            } else if (result.state === 'reveal' || result.state === 'owned') {
                if (result.bidAmount === '0.0') {
                    bidInfo += result.winningBidAmount;
                    bidInfo += '/';
                    bidInfo += result.value;
                } else {
                    if (!result.winning) {
                        bidInfo += result.bidAmount;
                        bidInfo += '/';
                    }
                    bidInfo += result.winningBidAmount;
                    bidInfo += '/';
                    bidInfo += result.value;
                }
            }

            console.log('  ' +
                        result.name +
                        padded(' ', 20 - result.name.length) +
                        dateInfo +
                        padded(' ', 40 - dateInfo.length) +
                        bidInfo);
        });

        if (warnings.length) {
            warnings.forEach(function(warning) {
                console.log('Warning: ' + warning);
            });
        }

        return null;
    }
}
plugins['scan-log'] = new ScanLogPlugin();

class WatchPlugin extends Plugin {
    help = "NAME [ NAME ... ]"

    private watch: boolean;

    private ens: ENS;
    private names: Array<string>;
    private opts: Opts;

    constructor(watch: boolean) {
        super();
        this.watch = watch;
    }

    prepare(opts: Opts): Promise<void> {
        if (opts.args.length < 2) {
            throw new Error(opts.args[0] + ' requires at least one NAME');
        }

        this.ens = new ENS(opts.provider);
        this.opts = opts;
        this.names = opts.args.slice(1);

        return Promise.resolve();
    }

    async run(): Promise<void> {
        let network = await this.ens.provider.getNetwork();

        for (let i = 0; i < this.names.length; i++) {
            let name = this.names[i];
            let nameInfo = await getNameInfo(this.ens, name, false);
            dumpNameInfo(name, nameInfo);

            let watching = false;
            loadLog(network.name).forEach((log) => {
                if (log.name !== name) { return; }
                if (log.command === 'watch') { watching = true; }
                if (log.command === 'ignore') { watching = false; }
            });

            if (watching === !this.watch) {
                await addLog(this.opts, (this.watch ? 'watch': 'ignore'), {
                    name: name,
                    startDate: nameInfo.startDate.getTime()
                });
            }
        }
    }
}
plugins['watch'] = new WatchPlugin(true);
plugins['ignore'] = new WatchPlugin(false);

/*
class _Plugin extends Plugin {
    help = "NAME"

    private opts: Opts;

    prepare(opts: Opts): Promise<void> {
        if (opts.args.length < 2) {
            throw new Error(opts.args[0] + ' requires at least one NAME');
        }

        this.opts = opts;

        return Promise.resolve();
    }

    async run(): Promise<void> {
        //let ens = new ENS(this.opts.provider);
    }
}
plugins['_'] = new _Plugin();
*/

abstract class SimplePlugin extends Plugin {

    protected account: ethers.Signer;
    protected opts: Opts;

    addLog(action: string, info: { [name: string]: any }): Promise<void> {
        return addLog(this.opts, action, info);
    }

    async prepare(opts: Opts): Promise<void> {
        let helps = this.help.split('[')[0].trim().split(' ');
        if (opts.args.length != helps.length + 1) {
            let help = helps[helps.length - 1];
            if (helps.length > 1) {
                 help = helps.slice(0, helps.length - 1).join(', ') + ' and ' + help
            }
            throw new Error(opts.args[0] + ' requires ' + help);
        }

        this.account = opts.accounts[0];
        if (!this.account) { throw new Error(opts.args[0] + ' requires an account; see --account'); }

        this.opts = opts;
    }
}

class StartAuctionPlugin extends SimplePlugin {
    help = "NAME"

    async run(): Promise<void> {
        let ens = new ENS(this.account);

        let name = this.opts.args[1];

        let tx = await ens.startAuction(name);

        dumpInfo('Start Auction: ' + name, [
            [ 'Label Hash', tx.metadata.labelHash ],
            [ 'Transaction Hash', tx.hash ],
        ]);

        this.addLog('startAuction', {
            address: tx.from,
            name: name,
            labelHash: tx.metadata.labelHash,
            transactionHash: tx.hash
        });

        return null;
    }
}
plugins['start-auction'] = new StartAuctionPlugin();

class BidPlugin extends Plugin {
    help = "NAME AMOUNT [ --extra AMOUNT ] [ --salt SALT | --secret SECRET ]";
    options = {
        extra: "send extra ether to mask the bid values",
        salt: "a specific salt to use (default: compute deterministically)",
        secret: "use keccak256(secret) as the salt"
    };

    private account: ethers.Signer;

    private name: string;
    private amount: ethers.utils.BigNumber;

    private extraAmount: ethers.utils.BigNumber;
    private salt: Uint8Array;

    private opts: Opts;

    async prepare(opts: Opts): Promise<void> {
        if (opts.args.length < 3) {
            throw new Error(opts.args[0] + ' requires NAME and AMOUNT');
        }

        this.account = opts.accounts[0];
        if (!this.account) { throw new Error(opts.args[0] + ' requires an account; see --account'); }

        if (opts.options.salt) {
            if (opts.options.secret) {
                throw new Error('you cannot specify both --salt and --secret');
            }
            if (!opts.options.salt.match(/^0x[0-9A-Fa-f]{64}$/)) {
                 throw new Error('invalid salt - must be 32 bytes of data');
            }
            this.salt = ethers.utils.arrayify(opts.options.salt);
        } else if (opts.options.secret) {
            this.salt = ethers.utils.arrayify(ethers.utils.id(opts.options.secret));
        }

        if (opts.options.extra) {
            this.extraAmount = ethers.utils.parseEther(opts.options.extra);
        } else {
            this.extraAmount = ethers.constants.Zero;
        }

        this.name = opts.args[1];
        this.amount = ethers.utils.parseEther(opts.args[2]);

        this.opts = opts;
    }

    async run(): Promise<void> {
        let ens = new ENS(this.account);

        let salt = this.salt;
        if (!salt) {
            let signature = await this.account.signMessage("ENS.bid-" + this.name + '@' + ethers.utils.formatEther(this.amount));
            salt = ethers.utils.arrayify(ethers.utils.keccak256(signature));
        }

        let tx = await ens.placeBid(this.name, this.amount, salt, this.extraAmount);

        dumpInfo('Place Bid: ' + this.name, [
            [ 'Label Hash', tx.metadata.labelHash ],
            [ 'Salt', ethers.utils.hexlify(salt) ],
            [ 'Sealed Bid', tx.metadata.sealedBid ],
            [ 'Transaction Hash', tx.hash ],
        ]);

        await addLog(this.opts, 'placeBid', {
            address: tx.from,
            bidAmount: ethers.utils.formatEther(this.amount),
            extraAmount: ethers.utils.formatEther(this.extraAmount),
            name: this.name,
            labelHash: tx.metadata.labelHash,
            salt: ethers.utils.hexlify(salt),
            sealedBid: tx.metadata.sealedBid,
            transactionHash: tx.hash
        });
    }
}
plugins['bid'] = new BidPlugin();

class RevealBidPlugin extends Plugin {
    help = "NAME AMOUNT [ --salt SALT | --secret SECRET ]";
    options = {
        salt: "a specific salt to use (default: compute deterministically)",
        secret: "use keccak256(secret) as the salt"
    };

    private account: ethers.Signer;

    private name: string;
    private amount: ethers.utils.BigNumber;

    private salt: Uint8Array;

    private opts: Opts;

    async prepare(opts: Opts): Promise<void> {
        if (opts.args.length < 3) {
            throw new Error(opts.args[0] + ' requires NAME and AMOUNT');
        }

        this.account = opts.accounts[0];
        if (!this.account) { throw new Error(opts.args[0] + ' requires an account; see --account'); }

        if (opts.options.salt) {
            if (opts.options.secret) {
                throw new Error('you cannot specify both --salt and --secret');
            }
            if (!opts.options.salt.match(/^0x[0-9A-Fa-f]{64}$/)) {
                 throw new Error('invalid salt - must be 32 bytes of data');
            }
            this.salt = ethers.utils.arrayify(opts.options.salt);
        } else if (opts.options.secret) {
            this.salt = ethers.utils.arrayify(ethers.utils.id(opts.options.secret));
        }

        this.name = opts.args[1];
        this.amount = ethers.utils.parseEther(opts.args[2]);

        this.opts = opts;
    }

    async run(): Promise<void> {
        let ens = new ENS(this.account);

        if (!this.salt) {
            let network = await ens.provider.getNetwork();

            let salts: { [salt: string]: boolean } = {};
            loadLog(network.name).forEach((op) => {
                if (op.command !== 'placeBid') { return; }
                if (!this.amount.eq(ethers.utils.parseEther(op.bidAmount))) { return; }
                if (op.name != this.name) { return; }
                salts[op.salt] = true;
            });

            if (Object.keys(salts).length > 1) {
                let message = 'ERROR: Multiple salts found for bid! Reveal each MANUALLY with --salt.\n';
                for (let s in salts) {
                    console.log('  ' + s + '\n');
                }
                throw new Error(message);
            }

            let saltHex = Object.keys(salts)[0];
            if (!saltHex) {
                throw new Error('no salt found in logs');
            }

            this.salt = ethers.utils.arrayify(saltHex);
        }

        let tx = await ens.revealBid(this.name, this.amount, this.salt);

        dumpInfo('Reveal Bid: ' + this.name, [
            [ 'Label Hash', tx.metadata.labelHash ],
            [ 'Salt', ethers.utils.hexlify(this.salt) ],
            [ 'Sealed Bid', tx.metadata.sealedBid ],
            [ 'Transaction Hash', tx.hash ],
        ]);

        await addLog(this.opts, 'revealBid', {
            address: tx.from,
            bidAmount: ethers.utils.formatEther(this.amount),
            name: this.name,
            labelHash: tx.metadata.labelHash,
            salt: ethers.utils.hexlify(this.salt),
            sealedBid: tx.metadata.sealedBid,
            transactionHash: tx.hash
        });
    }
}
plugins['reveal-bid'] = new RevealBidPlugin();

class FinalizeAuctionPlugin extends SimplePlugin {
    help = 'NAME'

    async run(): Promise<void> {
        let ens = new ENS(this.account);

        let name = this.opts.args[1];

        let tx = await ens.finalizeAuction(name);

        dumpInfo('Finalize Auction: ' + name, [
            [ 'Label Hash', tx.metadata.labelHash ],
            [ 'Transaction Hash', tx.hash ],
        ]);

        this.addLog('finalizeAuction', {
            address: tx.from,
            name: name,
            labelHash: tx.metadata.labelHash,
            transactionHash: tx.hash
        });
    }
}
plugins['finalize-auction'] = new FinalizeAuctionPlugin();

type EnsSetter = (name: string, ...params: Array<string>) => Promise<ENSTransactionResponse>;

class SetPlugin extends SimplePlugin {

    private key: string;
    private func: string;
    private header: string;

    constructor(key: string, func: string, param: string, header: string) {
        super();
        this.key = key;
        this.func = func;
        this.header = header;

        if (this.key == null) {
            this.help = "NAME KEY TEXT";
        } else if (this.key === 'resolver') {
            this.help = "NAME [ --resolver ADDRESS ]";
            this.options = { resolver: 'specify a resolver (default: resolver.eth)' };
        } else if (!param) {
            this.help = "NAME";
        } else {
            this.help = "NAME " + param;
        }
    }

    async run(): Promise<void> {
        let ens = new ENS(this.account);

        let func: EnsSetter = ((<any>ens)[this.func]).bind(ens);

        let name = this.opts.args[1];

        let key: string = this.key;
        let value: string = null;

        let tx: ENSTransactionResponse = null;
        if (key == null) {
            key = this.opts.args[2];
            value = this.opts.args[3];
            tx = await func(name, key, value);
        } else {
            if (key === 'resolver') {
                value = this.opts.options.resolver;
                if (!value) {
                    value = await ens.resolveName('resolver.eth');
                }
            } else {
                value = this.opts.args[2];
            }

            if (this.func === 'setText') {
                tx = await func(name, key, value);
            } else if (value != null) {
                tx = await func(name, value);
            } else {
                tx = await func(name);
            }
        }

        if (tx.metadata.nodeHash) {
            dumpInfo(this.header + ': ' + name, [
                [ 'Node Hash', tx.metadata.nodeHash ],
                [ 'Transaction Hash', tx.hash ]
            ]);
        } else {
            dumpInfo(this.header + ': ' + name, [
                [ 'Transaction Hash', tx.hash ]
            ]);
        }

        let info: any = {
            address: tx.from,
            name: name,
            transactionHash: tx.hash
        };

        if (tx.metadata.nodeHash) { info.nodeHash = tx.metadata.nodeHash; }
        if (tx.metadata.resolver) { info.nodeHash = tx.metadata.resolver; }

        if (this.func === 'setText') {
            info.key = key;
            info.text = value;
        } else if (value != null) {
            info[this.key] = value;
        }

        await this.addLog(this.func, info);
    }
}

options['resolver'] = '';
plugins['set-resolver'] = new SetPlugin('resolver', 'setResolver', null, 'Set Resolver');

plugins['set-address'] = new SetPlugin('addr', 'setAddress', 'ADDRESS', 'Set Address');
plugins['set-publickey'] = new SetPlugin('publicKey', 'setPublicKey', 'PUBLIC_KEY', 'Set Text');
plugins['set-email'] = new SetPlugin('email', 'setText', 'EMAIL_ADDRESS', 'Set Text');
plugins['set-url'] = new SetPlugin('url', 'setText', 'URL', 'Set Text');
plugins['set-text'] = new SetPlugin(null, 'setText', null, 'Set Text');

plugins['set-reverse'] = new SetPlugin('name', 'setReverseName', null, 'Set Reverse Name');

plugins['set-owner'] = new SetPlugin('newOwner', 'setOwner', 'ADDRESS', 'Set Owner');


class SetSubnodePlugin extends SimplePlugin {
    help = "LABEL.NAME [ --owner ADDRESS ]";
    options = { owner: "specify an owner (default: the calling account" }

    async run(): Promise<void> {
        let account = this.opts.accounts[0];
        if (!account) { throw new Error(this.opts.args[0] + ' requires an account; see --account'); }
        let ens = new ENS(account);

        let name = this.opts.args[1];
        let match = name.match(/^([^.]+)\.(.+)$/);
        let label = match[1];
        let parentName = match[2];

        let owner = this.opts.options.owner;
        if (!owner) {
            owner = await account.getAddress();
        }

        let tx = await ens.setSubnodeOwner(parentName, label, owner);

        dumpInfo('Set Subnode Owner' + ': ' + name, [
            [ 'Node Hash', tx.metadata.nodeHash ],
            [ 'Transaction Hash', tx.hash ]
        ]);

        await this.addLog('setSubnode', {
            address: tx.from,
            label: label,
            labelHash: tx.metadata.labelHash,
            name: name,
            owner: owner,
            parentName: parentName,
            nodeHash: tx.metadata.nodeHash,
            transactionHash: tx.hash,
        });
    }
}
options['owner'] = '';
plugins['set-subnode'] = new SetSubnodePlugin();

run(options, plugins);
