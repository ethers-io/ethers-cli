#!/usr/bin/env node
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var ethers_1 = require("ethers");
var ethers_ens_1 = require("ethers-ens");
var cli_1 = require("../lib/cli");
function padded(char, length) {
    var result = '';
    while (result.length < length) {
        result += char;
    }
    return result;
}
function getMaxBid(ops) {
    var maxBidAmount = ethers_1.ethers.utils.bigNumberify(0);
    ops.forEach(function (op) {
        if (op.command !== 'placeBid') {
            return;
        }
        var bidAmount = ethers_1.ethers.utils.parseEther(op.bidAmount);
        if (bidAmount.gte(maxBidAmount)) {
            maxBidAmount = bidAmount;
        }
    });
    return ethers_1.ethers.utils.formatEther(maxBidAmount);
}
function getDeeds(ens, ops) {
    var deeds = ops.filter(function (op) { return (op.command === 'placeBid'); }).map(function (op) {
        if (op.sealedBid) {
            return Promise.resolve(op.sealedBid);
        }
        return ens.getBidHash(op.name, op.address, ethers_1.ethers.utils.parseEther(op.bidAmount), op.salt).then(function (sealedBid) {
            return ens.getDeedAddress(op.address, sealedBid);
        }).then(function (deed) {
            return {
                address: deed,
                bidAmount: op.bidAmount,
                sealedBid: op.sealedBid
            };
        });
    });
    return Promise.all(deeds);
}
function dumpInfo(header, result) {
    if (header) {
        console.log(header);
    }
    var maxLength = 0;
    result.forEach(function (record) {
        if (record[0].length > maxLength) {
            maxLength = record[0].length;
        }
    });
    result.forEach(function (record) {
        var key = record[0];
        var value = record[1];
        if (value instanceof Date) {
            value = ethers_ens_1.getDateTimer(value);
        }
        console.log('  ' + key + ':' + padded(' ', 3 + maxLength - key.length) + value);
    });
}
function dumpNameInfo(header, nameInfo) {
    var result = [];
    if (nameInfo.state) {
        result.push(['State', nameInfo.state]);
        result.push(['Available Start Date', ethers_ens_1.getDateTimer(nameInfo.startDate)]);
    }
    if (nameInfo.state == 'auction' || nameInfo.state == 'reveal' || nameInfo.state == '') {
        result.push(['Auction Reveal Date', ethers_ens_1.getDateTimer(nameInfo.revealDate)]);
        result.push(['Auction End Date', ethers_ens_1.getDateTimer(nameInfo.endDate)]);
    }
    if (nameInfo.state == 'reveal' || nameInfo.state == 'owned') {
        result.push(['Winning Deed', nameInfo.winningDeed]);
        result.push(['Winning Bidder', nameInfo.winningBidder]);
        result.push(['Value', nameInfo.value]);
        result.push(['Highest Bid', nameInfo.highestBid]);
    }
    if (nameInfo.state == 'owned' || !nameInfo.state) {
        result.push(['Owner', nameInfo.owner]);
        result.push(['Resolver', nameInfo.resolver]);
        result.push(['Address', nameInfo.addr]);
        if (nameInfo.reverseName) {
            result.push(['Reverse Name', nameInfo.reverseName]);
        }
        if (nameInfo.publicKey) {
            result.push(['Public Key', nameInfo.publicKey]);
        }
        if (nameInfo.email) {
            result.push(['Email', nameInfo.email]);
        }
        if (nameInfo.url) {
            result.push(['URL', nameInfo.url]);
        }
        if (nameInfo.contentHash) {
            result.push(['Content Hash', nameInfo.contentHash]);
        }
    }
    return dumpInfo(header, result);
}
function addLog(opts, action, info) {
    info = ethers_1.ethers.utils.shallowCopy(info);
    return opts.provider.getNetwork().then(function (network) {
        if (opts.options.nolog) {
            return;
        }
        info.network = network.name;
        // Prepare the log (action and date)
        var log = action + ' - ' + ethers_ens_1.getDate(new Date()) + '\n';
        // Add each sorted key
        var keys = Object.keys(info);
        keys.sort();
        keys.forEach(function (key) {
            log += '  ' + key + ':' + padded(' ', 20 - key.length) + info[key] + '\n';
        });
        // Append it to the log
        fs_1.default.appendFileSync('ens-log.txt', log);
    });
}
function loadLog(network) {
    var data = '';
    try {
        data = fs_1.default.readFileSync('ens-log.txt').toString();
    }
    catch (error) {
        // File doesn't exist, so no log to load
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
    var entries = [];
    var entry = {};
    data.split('\n').forEach(function (line) {
        if (line.substring(0, 1) === '#') {
            return;
        }
        if (line.substring(0, 2) === '  ') {
            var comps = line.split(/:/);
            entry[comps[0].trim()] = comps[1].trim();
        }
        else if (line.indexOf(' - ') >= 0) {
            entry = {};
            var comps = line.split(' - ');
            entry.command = comps[0];
            entry.date = comps[1];
            entries.push(entry);
        }
    });
    // Check chonologically for ignore/watch commands for the most recent stste
    var ignore = {};
    entries.forEach(function (entry) {
        if (entry.command === 'ignore') {
            ignore[entry.name] = true;
        }
        else if (entry.command === 'watch') {
            ignore[entry.name] = false;
        }
    });
    // Filter out entries we don't care about
    var filtered = [];
    entries.forEach(function (entry) {
        if (entry.network === 'testnet') {
            entry.network = 'ropsten';
        }
        if (entry.network === 'mainnet') {
            entry.network = 'homestead';
        }
        if (entry.network !== network) {
            return;
        }
        if (entry.command === 'ignore') {
            return;
        }
        if (ignore[entry.name]) {
            return;
        }
        filtered.push(entry);
    });
    return filtered;
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
function getNameInfo(ens, name, extra) {
    var result = {
        resolver: ens.getResolver(name),
        owner: ens.getOwner(name),
        addr: ens.getAddress(name),
    };
    if (extra) {
        result.publicKey = ens.getPublicKey(name);
        result.url = ens.getText(name, 'url');
        result.email = ens.getText(name, 'email');
        result.contentHash = ens.getContentHash(name, true);
    }
    if (name.match(/\.eth$/) && name.split('.').length === 2) {
        result.auction = ens.getAuction(name);
        result.startDate = ens.getAuctionStartDate(name);
    }
    return ethers_1.ethers.utils.resolveProperties(result).then(function (result) {
        var nameInfo = {
            resolver: result.resolver,
            owner: result.owner,
            addr: result.addr,
            name: name,
        };
        if (result.publicKey) {
            nameInfo.publicKey = result.publicKey;
        }
        if (result.url) {
            nameInfo.url = result.url;
        }
        if (result.email) {
            nameInfo.email = result.email;
        }
        if (result.contentHash) {
            nameInfo.contentHash = result.contentHash;
        }
        if (result.auction) {
            nameInfo.startDate = result.startDate;
            var auction = result.auction;
            nameInfo.state = auction.state;
            nameInfo.winningDeed = auction.winningDeed;
            nameInfo.endDate = auction.endDate;
            nameInfo.revealDate = auction.revealDate;
            nameInfo.value = ethers_1.ethers.utils.formatEther(auction.value);
            nameInfo.highestBid = ethers_1.ethers.utils.formatEther(auction.highestBid);
        }
        if (nameInfo.winningDeed && nameInfo.winningDeed !== ethers_1.ethers.constants.AddressZero) {
            return ens.getDeedOwner(nameInfo.winningDeed).then(function (deedOwner) {
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
var options = {
    _accounts: true,
    _provider: true,
    _transaction: true,
    _name: 'ethers',
};
var plugins = {};
var LookupPlugin = /** @class */ (function (_super) {
    __extends(LookupPlugin, _super);
    function LookupPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "NAME [ NAME ... ]";
        return _this;
    }
    LookupPlugin.prototype.prepare = function (opts) {
        if (opts.args.length < 2) {
            throw new Error('lookup requires at least one NAME');
        }
        this.ens = new ethers_ens_1.ENS(opts.provider);
        this.names = opts.args.slice(1);
        return Promise.resolve();
    };
    LookupPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var seq;
            var _this = this;
            return __generator(this, function (_a) {
                seq = Promise.resolve();
                this.names.forEach(function (name) {
                    seq = seq.then(function () {
                        try {
                            var address_1 = ethers_1.ethers.utils.getAddress(name);
                            return _this.ens.lookupAddress(name).then(function (name) {
                                if (name) {
                                    return getNameInfo(_this.ens, name, true).then(function (nameInfo) {
                                        nameInfo.reverseName = name;
                                        dumpNameInfo('Address: ' + address_1, nameInfo);
                                        return null;
                                    });
                                }
                                dumpInfo('Address: ' + address_1, [['Reverse Name Lookup', 'null']]);
                                return null;
                            });
                        }
                        catch (error) { }
                        return getNameInfo(_this.ens, name, true).then(function (nameInfo) {
                            dumpNameInfo('Name: ' + name, nameInfo);
                            return null;
                        });
                    });
                });
                return [2 /*return*/, seq];
            });
        });
    };
    return LookupPlugin;
}(cli_1.Plugin));
plugins['lookup'] = new LookupPlugin();
var ScanLogPlugin = /** @class */ (function (_super) {
    __extends(ScanLogPlugin, _super);
    function ScanLogPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "";
        return _this;
    }
    ScanLogPlugin.prototype.prepare = function (opts) {
        if (opts.args.length !== 1) {
            throw new Error('scan-log has no parameters');
        }
        this.ens = new ethers_ens_1.ENS(opts.provider);
        return Promise.resolve();
    };
    ScanLogPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var network, logs, names, results, _loop_1, this_1, _a, _b, _i, name_1, state_1, warnings, lastState;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.ens.provider.getNetwork()];
                    case 1:
                        network = _c.sent();
                        logs = loadLog(network.name);
                        names = {};
                        logs.forEach(function (log) {
                            if (log.name) {
                                if (!names[log.name]) {
                                    names[log.name] = { operations: [], name: log.name, log: null };
                                }
                                names[log.name].operations.push(log);
                            }
                        });
                        results = [];
                        _loop_1 = function (name_1) {
                            var ops, auction, result, _a, _b, deedOwner_1, deeds, deedOwner_2;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        if (!name_1.match(/\.eth$/) || name_1.split('.').length !== 2) {
                                            return [2 /*return*/, "break"];
                                        }
                                        ops = names[name_1].operations || [];
                                        return [4 /*yield*/, this_1.ens.getAuction(name_1)];
                                    case 1:
                                        auction = _c.sent();
                                        result = {
                                            date: auction.endDate,
                                            endDate: auction.endDate,
                                            name: name_1,
                                            state: auction.state,
                                            value: ethers_1.ethers.utils.formatEther(auction.value),
                                            winningBidAmount: ethers_1.ethers.utils.formatEther(auction.highestBid)
                                        };
                                        if (!(auction.state === 'open' || auction.state === 'not-yet-available')) return [3 /*break*/, 3];
                                        _a = result;
                                        return [4 /*yield*/, this_1.ens.getAuctionStartDate(name_1)];
                                    case 2:
                                        _a.date = _c.sent();
                                        _c.label = 3;
                                    case 3:
                                        if (!(auction.state === 'owned')) return [3 /*break*/, 6];
                                        _b = result;
                                        return [4 /*yield*/, this_1.ens.getOwner(name_1)];
                                    case 4:
                                        _b.owner = _c.sent();
                                        return [4 /*yield*/, this_1.ens.getDeedOwner(auction.winningDeed)];
                                    case 5:
                                        deedOwner_1 = _c.sent();
                                        result.winning = false;
                                        ops.forEach(function (op) {
                                            if (result.owner === op.address || deedOwner_1 === op.address) {
                                                result.winning = true;
                                                result.bidAmount = result.winningBidAmount;
                                            }
                                        });
                                        if (!result.winning) {
                                            result.bidAmount = getMaxBid(ops);
                                        }
                                        _c.label = 6;
                                    case 6:
                                        if (!(auction.state === 'auction')) return [3 /*break*/, 8];
                                        result.date = result.revealDate;
                                        result.bidAmount = getMaxBid(ops);
                                        return [4 /*yield*/, getDeeds(this_1.ens, ops)];
                                    case 7:
                                        deeds = _c.sent();
                                        result.deedAddresses = deeds.map(function (deed) { return deed.address; });
                                        _c.label = 8;
                                    case 8:
                                        if (!(auction.state === 'reveal')) return [3 /*break*/, 11];
                                        if (!(auction.winningDeed !== ethers_1.ethers.constants.AddressZero)) return [3 /*break*/, 10];
                                        result.winning = false;
                                        return [4 /*yield*/, this_1.ens.getDeedOwner(auction.winningDeed)];
                                    case 9:
                                        deedOwner_2 = _c.sent();
                                        ops.forEach(function (op) {
                                            if (op.address === deedOwner_2) {
                                                result.winning = true;
                                                result.bidAmount = op.bidAmount;
                                            }
                                        });
                                        if (!result.winning) {
                                            result.bidAmount = getMaxBid(ops);
                                        }
                                        return [3 /*break*/, 11];
                                    case 10:
                                        result.bidAmount = getMaxBid(ops);
                                        _c.label = 11;
                                    case 11:
                                        results.push(result);
                                        return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _a = [];
                        for (_b in names)
                            _a.push(_b);
                        _i = 0;
                        _c.label = 2;
                    case 2:
                        if (!(_i < _a.length)) return [3 /*break*/, 5];
                        name_1 = _a[_i];
                        return [5 /*yield**/, _loop_1(name_1)];
                    case 3:
                        state_1 = _c.sent();
                        if (state_1 === "break")
                            return [3 /*break*/, 5];
                        _c.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5:
                        results.sort(function (a, b) {
                            if (a.state === 'not-yet-available') {
                                if (b.state === 'open') {
                                    return -1;
                                }
                                if (a.state === b.state) {
                                    return (a.date.getTime() - b.date.getTime());
                                }
                            }
                            else if (a.state === 'open') {
                                if (b.state === 'not-yet-available') {
                                    return 1;
                                }
                                if (a.state === b.state) {
                                    return (a.date.getTime() - b.date.getTime());
                                }
                            }
                            return a.endDate.getTime() - b.endDate.getTime();
                        });
                        warnings = [];
                        lastState = null;
                        results.forEach(function (result) {
                            if (result.state !== lastState) {
                                console.log(result.state);
                                lastState = result.state;
                            }
                            var dateInfo = ethers_ens_1.getDateTimer(result.date);
                            var warn = false;
                            if (result.state === 'auction' && result.deedAddresses) {
                                result.deedAddresses.forEach(function (address) {
                                    if (address !== ethers_1.ethers.constants.AddressZero) {
                                        return;
                                    }
                                    warnings.push('placeBid(' + result.name + ', ' + result.bidAmount + ') is missing on the blockchain');
                                    warn = true;
                                });
                            }
                            if (result.state === 'reveal' && result.deedAddresses) {
                                result.deedAddresses.forEach(function (address) {
                                    if (address === ethers_1.ethers.constants.AddressZero) {
                                        return;
                                    }
                                    warnings.push('revealBid(' + result.name + ', ' + result.bidAmount + ') has not been called');
                                    warn = true;
                                });
                            }
                            if (result.state === 'owned' && result.owner === ethers_1.ethers.constants.AddressZero && result.winning) {
                                warnings.push('finalizeAuction(' + result.name + ') has not been called');
                                warn = true;
                            }
                            var bidInfo = ' ';
                            bidInfo += (warn ? '!! ' : '   ');
                            bidInfo += (result.winning ? '* ' : '  ');
                            if (result.state === 'auction' && result.bidAmount !== '0.0') {
                                bidInfo += result.bidAmount;
                            }
                            else if (result.state === 'reveal' || result.state === 'owned') {
                                if (result.bidAmount === '0.0') {
                                    bidInfo += result.winningBidAmount;
                                    bidInfo += '/';
                                    bidInfo += result.value;
                                }
                                else {
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
                            warnings.forEach(function (warning) {
                                console.log('Warning: ' + warning);
                            });
                        }
                        return [2 /*return*/, null];
                }
            });
        });
    };
    return ScanLogPlugin;
}(cli_1.Plugin));
plugins['scan-log'] = new ScanLogPlugin();
var WatchPlugin = /** @class */ (function (_super) {
    __extends(WatchPlugin, _super);
    function WatchPlugin(watch) {
        var _this = _super.call(this) || this;
        _this.help = "NAME [ NAME ... ]";
        _this.watch = watch;
        return _this;
    }
    WatchPlugin.prototype.prepare = function (opts) {
        if (opts.args.length < 2) {
            throw new Error(opts.args[0] + ' requires at least one NAME');
        }
        this.ens = new ethers_ens_1.ENS(opts.provider);
        this.opts = opts;
        this.names = opts.args.slice(1);
        return Promise.resolve();
    };
    WatchPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var network, _loop_2, this_2, i;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ens.provider.getNetwork()];
                    case 1:
                        network = _a.sent();
                        _loop_2 = function (i) {
                            var name_2, nameInfo, watching;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        name_2 = this_2.names[i];
                                        return [4 /*yield*/, getNameInfo(this_2.ens, name_2, false)];
                                    case 1:
                                        nameInfo = _a.sent();
                                        dumpNameInfo(name_2, nameInfo);
                                        watching = false;
                                        loadLog(network.name).forEach(function (log) {
                                            if (log.name !== name_2) {
                                                return;
                                            }
                                            if (log.command === 'watch') {
                                                watching = true;
                                            }
                                            if (log.command === 'ignore') {
                                                watching = false;
                                            }
                                        });
                                        if (!(watching === !this_2.watch)) return [3 /*break*/, 3];
                                        return [4 /*yield*/, addLog(this_2.opts, (this_2.watch ? 'watch' : 'ignore'), {
                                                name: name_2,
                                                startDate: nameInfo.startDate.getTime()
                                            })];
                                    case 2:
                                        _a.sent();
                                        _a.label = 3;
                                    case 3: return [2 /*return*/];
                                }
                            });
                        };
                        this_2 = this;
                        i = 0;
                        _a.label = 2;
                    case 2:
                        if (!(i < this.names.length)) return [3 /*break*/, 5];
                        return [5 /*yield**/, _loop_2(i)];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        i++;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return WatchPlugin;
}(cli_1.Plugin));
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
var SimplePlugin = /** @class */ (function (_super) {
    __extends(SimplePlugin, _super);
    function SimplePlugin() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    SimplePlugin.prototype.addLog = function (action, info) {
        return addLog(this.opts, action, info);
    };
    SimplePlugin.prototype.prepare = function (opts) {
        return __awaiter(this, void 0, void 0, function () {
            var helps, help;
            return __generator(this, function (_a) {
                helps = this.help.split('[')[0].trim().split(' ');
                if (opts.args.length != helps.length + 1) {
                    help = helps[helps.length - 1];
                    if (helps.length > 1) {
                        help = helps.slice(0, helps.length - 1).join(', ') + ' and ' + help;
                    }
                    throw new Error(opts.args[0] + ' requires ' + help);
                }
                this.account = opts.accounts[0];
                if (!this.account) {
                    throw new Error(opts.args[0] + ' requires an account; see --account');
                }
                this.opts = opts;
                return [2 /*return*/];
            });
        });
    };
    return SimplePlugin;
}(cli_1.Plugin));
var StartAuctionPlugin = /** @class */ (function (_super) {
    __extends(StartAuctionPlugin, _super);
    function StartAuctionPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "NAME";
        return _this;
    }
    StartAuctionPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ens, name, tx;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ens = new ethers_ens_1.ENS(this.account);
                        name = this.opts.args[1];
                        return [4 /*yield*/, ens.startAuction(name)];
                    case 1:
                        tx = _a.sent();
                        dumpInfo('Start Auction: ' + name, [
                            ['Label Hash', tx.metadata.labelHash],
                            ['Transaction Hash', tx.hash],
                        ]);
                        this.addLog('startAuction', {
                            address: tx.from,
                            name: name,
                            labelHash: tx.metadata.labelHash,
                            transactionHash: tx.hash
                        });
                        return [2 /*return*/, null];
                }
            });
        });
    };
    return StartAuctionPlugin;
}(SimplePlugin));
plugins['start-auction'] = new StartAuctionPlugin();
var BidPlugin = /** @class */ (function (_super) {
    __extends(BidPlugin, _super);
    function BidPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "NAME AMOUNT [ --extra AMOUNT ] [ --salt SALT | --secret SECRET ]";
        _this.options = {
            extra: "send extra ether to mask the bid values",
            salt: "a specific salt to use (default: compute deterministically)",
            secret: "use keccak256(secret) as the salt"
        };
        return _this;
    }
    BidPlugin.prototype.prepare = function (opts) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (opts.args.length < 3) {
                    throw new Error(opts.args[0] + ' requires NAME and AMOUNT');
                }
                this.account = opts.accounts[0];
                if (!this.account) {
                    throw new Error(opts.args[0] + ' requires an account; see --account');
                }
                if (opts.options.salt) {
                    if (opts.options.secret) {
                        throw new Error('you cannot specify both --salt and --secret');
                    }
                    if (!opts.options.salt.match(/^0x[0-9A-Fa-f]{64}$/)) {
                        throw new Error('invalid salt - must be 32 bytes of data');
                    }
                    this.salt = ethers_1.ethers.utils.arrayify(opts.options.salt);
                }
                else if (opts.options.secret) {
                    this.salt = ethers_1.ethers.utils.arrayify(ethers_1.ethers.utils.id(opts.options.secret));
                }
                if (opts.options.extra) {
                    this.extraAmount = ethers_1.ethers.utils.parseEther(opts.options.extra);
                }
                else {
                    this.extraAmount = ethers_1.ethers.constants.Zero;
                }
                this.name = opts.args[1];
                this.amount = ethers_1.ethers.utils.parseEther(opts.args[2]);
                this.opts = opts;
                return [2 /*return*/];
            });
        });
    };
    BidPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ens, salt, signature, tx;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ens = new ethers_ens_1.ENS(this.account);
                        salt = this.salt;
                        if (!!salt) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.account.signMessage("ENS.bid-" + this.name + '@' + ethers_1.ethers.utils.formatEther(this.amount))];
                    case 1:
                        signature = _a.sent();
                        salt = ethers_1.ethers.utils.arrayify(ethers_1.ethers.utils.keccak256(signature));
                        _a.label = 2;
                    case 2: return [4 /*yield*/, ens.placeBid(this.name, this.amount, salt, this.extraAmount)];
                    case 3:
                        tx = _a.sent();
                        dumpInfo('Place Bid: ' + this.name, [
                            ['Label Hash', tx.metadata.labelHash],
                            ['Salt', ethers_1.ethers.utils.hexlify(salt)],
                            ['Sealed Bid', tx.metadata.sealedBid],
                            ['Transaction Hash', tx.hash],
                        ]);
                        return [4 /*yield*/, addLog(this.opts, 'placeBid', {
                                address: tx.from,
                                bidAmount: ethers_1.ethers.utils.formatEther(this.amount),
                                extraAmount: ethers_1.ethers.utils.formatEther(this.extraAmount),
                                name: this.name,
                                labelHash: tx.metadata.labelHash,
                                salt: ethers_1.ethers.utils.hexlify(salt),
                                sealedBid: tx.metadata.sealedBid,
                                transactionHash: tx.hash
                            })];
                    case 4:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return BidPlugin;
}(cli_1.Plugin));
plugins['bid'] = new BidPlugin();
var RevealBidPlugin = /** @class */ (function (_super) {
    __extends(RevealBidPlugin, _super);
    function RevealBidPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "NAME AMOUNT [ --salt SALT | --secret SECRET ]";
        _this.options = {
            salt: "a specific salt to use (default: compute deterministically)",
            secret: "use keccak256(secret) as the salt"
        };
        return _this;
    }
    RevealBidPlugin.prototype.prepare = function (opts) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (opts.args.length < 3) {
                    throw new Error(opts.args[0] + ' requires NAME and AMOUNT');
                }
                this.account = opts.accounts[0];
                if (!this.account) {
                    throw new Error(opts.args[0] + ' requires an account; see --account');
                }
                if (opts.options.salt) {
                    if (opts.options.secret) {
                        throw new Error('you cannot specify both --salt and --secret');
                    }
                    if (!opts.options.salt.match(/^0x[0-9A-Fa-f]{64}$/)) {
                        throw new Error('invalid salt - must be 32 bytes of data');
                    }
                    this.salt = ethers_1.ethers.utils.arrayify(opts.options.salt);
                }
                else if (opts.options.secret) {
                    this.salt = ethers_1.ethers.utils.arrayify(ethers_1.ethers.utils.id(opts.options.secret));
                }
                this.name = opts.args[1];
                this.amount = ethers_1.ethers.utils.parseEther(opts.args[2]);
                this.opts = opts;
                return [2 /*return*/];
            });
        });
    };
    RevealBidPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ens, network, salts_1, message, s, saltHex, tx;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ens = new ethers_ens_1.ENS(this.account);
                        if (!!this.salt) return [3 /*break*/, 2];
                        return [4 /*yield*/, ens.provider.getNetwork()];
                    case 1:
                        network = _a.sent();
                        salts_1 = {};
                        loadLog(network.name).forEach(function (op) {
                            if (op.command !== 'placeBid') {
                                return;
                            }
                            if (!_this.amount.eq(ethers_1.ethers.utils.parseEther(op.bidAmount))) {
                                return;
                            }
                            if (op.name != _this.name) {
                                return;
                            }
                            salts_1[op.salt] = true;
                        });
                        if (Object.keys(salts_1).length > 1) {
                            message = 'ERROR: Multiple salts found for bid! Reveal each MANUALLY with --salt.\n';
                            for (s in salts_1) {
                                console.log('  ' + s + '\n');
                            }
                            throw new Error(message);
                        }
                        saltHex = Object.keys(salts_1)[0];
                        if (!saltHex) {
                            throw new Error('no salt found in logs');
                        }
                        this.salt = ethers_1.ethers.utils.arrayify(saltHex);
                        _a.label = 2;
                    case 2: return [4 /*yield*/, ens.revealBid(this.name, this.amount, this.salt)];
                    case 3:
                        tx = _a.sent();
                        dumpInfo('Reveal Bid: ' + this.name, [
                            ['Label Hash', tx.metadata.labelHash],
                            ['Salt', ethers_1.ethers.utils.hexlify(this.salt)],
                            ['Sealed Bid', tx.metadata.sealedBid],
                            ['Transaction Hash', tx.hash],
                        ]);
                        return [4 /*yield*/, addLog(this.opts, 'revealBid', {
                                address: tx.from,
                                bidAmount: ethers_1.ethers.utils.formatEther(this.amount),
                                name: this.name,
                                labelHash: tx.metadata.labelHash,
                                salt: ethers_1.ethers.utils.hexlify(this.salt),
                                sealedBid: tx.metadata.sealedBid,
                                transactionHash: tx.hash
                            })];
                    case 4:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return RevealBidPlugin;
}(cli_1.Plugin));
plugins['reveal-bid'] = new RevealBidPlugin();
var FinalizeAuctionPlugin = /** @class */ (function (_super) {
    __extends(FinalizeAuctionPlugin, _super);
    function FinalizeAuctionPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = 'NAME';
        return _this;
    }
    FinalizeAuctionPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ens, name, tx;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ens = new ethers_ens_1.ENS(this.account);
                        name = this.opts.args[1];
                        return [4 /*yield*/, ens.finalizeAuction(name)];
                    case 1:
                        tx = _a.sent();
                        dumpInfo('Finalize Auction: ' + name, [
                            ['Label Hash', tx.metadata.labelHash],
                            ['Transaction Hash', tx.hash],
                        ]);
                        this.addLog('finalizeAuction', {
                            address: tx.from,
                            name: name,
                            labelHash: tx.metadata.labelHash,
                            transactionHash: tx.hash
                        });
                        return [2 /*return*/];
                }
            });
        });
    };
    return FinalizeAuctionPlugin;
}(SimplePlugin));
plugins['finalize-auction'] = new FinalizeAuctionPlugin();
var SetPlugin = /** @class */ (function (_super) {
    __extends(SetPlugin, _super);
    function SetPlugin(key, func, param, header) {
        var _this = _super.call(this) || this;
        _this.key = key;
        _this.func = func;
        _this.header = header;
        if (_this.key == null) {
            _this.help = "NAME KEY TEXT";
        }
        else if (_this.key === 'resolver') {
            _this.help = "NAME [ --resolver ADDRESS ]";
            _this.options = { resolver: 'specify a resolver (default: resolver.eth)' };
        }
        else if (!param) {
            _this.help = "NAME";
        }
        else {
            _this.help = "NAME " + param;
        }
        return _this;
    }
    SetPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ens, func, name, key, value, tx, info;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ens = new ethers_ens_1.ENS(this.account);
                        func = (ens[this.func]).bind(ens);
                        name = this.opts.args[1];
                        key = this.key;
                        value = null;
                        tx = null;
                        if (!(key == null)) return [3 /*break*/, 2];
                        key = this.opts.args[2];
                        value = this.opts.args[3];
                        return [4 /*yield*/, func(name, key, value)];
                    case 1:
                        tx = _a.sent();
                        return [3 /*break*/, 12];
                    case 2:
                        if (!(key === 'resolver')) return [3 /*break*/, 5];
                        value = this.opts.options.resolver;
                        if (!!value) return [3 /*break*/, 4];
                        return [4 /*yield*/, ens.resolveName('resolver.eth')];
                    case 3:
                        value = _a.sent();
                        _a.label = 4;
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        value = this.opts.args[2];
                        _a.label = 6;
                    case 6:
                        if (!(this.func === 'setText')) return [3 /*break*/, 8];
                        return [4 /*yield*/, func(name, key, value)];
                    case 7:
                        tx = _a.sent();
                        return [3 /*break*/, 12];
                    case 8:
                        if (!(value != null)) return [3 /*break*/, 10];
                        return [4 /*yield*/, func(name, value)];
                    case 9:
                        tx = _a.sent();
                        return [3 /*break*/, 12];
                    case 10: return [4 /*yield*/, func(name)];
                    case 11:
                        tx = _a.sent();
                        _a.label = 12;
                    case 12:
                        if (tx.metadata.nodeHash) {
                            dumpInfo(this.header + ': ' + name, [
                                ['Node Hash', tx.metadata.nodeHash],
                                ['Transaction Hash', tx.hash]
                            ]);
                        }
                        else {
                            dumpInfo(this.header + ': ' + name, [
                                ['Transaction Hash', tx.hash]
                            ]);
                        }
                        info = {
                            address: tx.from,
                            name: name,
                            transactionHash: tx.hash
                        };
                        if (tx.metadata.nodeHash) {
                            info.nodeHash = tx.metadata.nodeHash;
                        }
                        if (tx.metadata.resolver) {
                            info.nodeHash = tx.metadata.resolver;
                        }
                        if (this.func === 'setText') {
                            info.key = key;
                            info.text = value;
                        }
                        else if (value != null) {
                            info[this.key] = value;
                        }
                        return [4 /*yield*/, this.addLog(this.func, info)];
                    case 13:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return SetPlugin;
}(SimplePlugin));
options['resolver'] = '';
plugins['set-resolver'] = new SetPlugin('resolver', 'setResolver', null, 'Set Resolver');
plugins['set-address'] = new SetPlugin('addr', 'setAddress', 'ADDRESS', 'Set Address');
plugins['set-publickey'] = new SetPlugin('publicKey', 'setPublicKey', 'PUBLIC_KEY', 'Set Text');
plugins['set-email'] = new SetPlugin('email', 'setText', 'EMAIL_ADDRESS', 'Set Text');
plugins['set-url'] = new SetPlugin('url', 'setText', 'URL', 'Set Text');
plugins['set-text'] = new SetPlugin(null, 'setText', null, 'Set Text');
plugins['set-reverse'] = new SetPlugin('name', 'setReverseName', null, 'Set Reverse Name');
plugins['set-owner'] = new SetPlugin('newOwner', 'setOwner', 'ADDRESS', 'Set Owner');
var SetSubnodePlugin = /** @class */ (function (_super) {
    __extends(SetSubnodePlugin, _super);
    function SetSubnodePlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "LABEL.NAME [ --owner ADDRESS ]";
        _this.options = { owner: "specify an owner (default: the calling account" };
        return _this;
    }
    SetSubnodePlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var account, ens, name, match, label, parentName, owner, tx;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        account = this.opts.accounts[0];
                        if (!account) {
                            throw new Error(this.opts.args[0] + ' requires an account; see --account');
                        }
                        ens = new ethers_ens_1.ENS(account);
                        name = this.opts.args[1];
                        match = name.match(/^([^.]+)\.(.+)$/);
                        label = match[1];
                        parentName = match[2];
                        owner = this.opts.options.owner;
                        if (!!owner) return [3 /*break*/, 2];
                        return [4 /*yield*/, account.getAddress()];
                    case 1:
                        owner = _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, ens.setSubnodeOwner(parentName, label, owner)];
                    case 3:
                        tx = _a.sent();
                        dumpInfo('Set Subnode Owner' + ': ' + name, [
                            ['Node Hash', tx.metadata.nodeHash],
                            ['Transaction Hash', tx.hash]
                        ]);
                        return [4 /*yield*/, this.addLog('setSubnode', {
                                address: tx.from,
                                label: label,
                                labelHash: tx.metadata.labelHash,
                                name: name,
                                owner: owner,
                                parentName: parentName,
                                nodeHash: tx.metadata.nodeHash,
                                transactionHash: tx.hash,
                            })];
                    case 4:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return SetSubnodePlugin;
}(SimplePlugin));
options['owner'] = '';
plugins['set-subnode'] = new SetSubnodePlugin();
cli_1.run(options, plugins);
