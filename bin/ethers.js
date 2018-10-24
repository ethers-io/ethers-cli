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
var repl_1 = __importDefault(require("repl"));
var util_1 = __importDefault(require("util"));
var vm_1 = __importDefault(require("vm"));
var ethers_1 = require("ethers");
var cli_1 = require("../lib/cli");
var options = {
    _accounts: true,
    _provider: true,
    _transaction: true,
    _name: 'ethers',
};
var plugins = {};
function setupContext(context, opts) {
    context.provider = opts.provider;
    context.accounts = opts.accounts;
    if (!context.console) {
        context.console = console;
    }
    if (!context.require) {
        context.require = require;
    }
    context.ethers = ethers_1.ethers;
    context.version = ethers_1.ethers.version;
    context.Contract = ethers_1.ethers.Contract;
    context.ContractFactory = ethers_1.ethers.ContractFactory;
    context.Wallet = ethers_1.ethers.Wallet;
    context.getNetwork = ethers_1.ethers.utils.getNetwork;
    context.providers = ethers_1.ethers.providers;
    context.utils = ethers_1.ethers.utils;
    context.abiCoder = ethers_1.ethers.utils.defaultAbiCoder;
    context.parseSignature = ethers_1.ethers.utils.parseSignature;
    context.formatSignature = ethers_1.ethers.utils.formatSignature;
    context.BN = ethers_1.ethers.utils.bigNumberify;
    context.bigNumberify = ethers_1.ethers.utils.bigNumberify;
    context.getAddress = ethers_1.ethers.utils.getAddress;
    context.getContractAddress = ethers_1.ethers.utils.getContractAddress;
    context.getIcapAddress = ethers_1.ethers.utils.getIcapAddress;
    context.arrayify = ethers_1.ethers.utils.arrayify;
    context.hexlify = ethers_1.ethers.utils.hexlify;
    context.joinSignature = ethers_1.ethers.utils.joinSignature;
    context.splitSignature = ethers_1.ethers.utils.splitSignature;
    context.id = ethers_1.ethers.utils.id;
    context.keccak256 = ethers_1.ethers.utils.keccak256;
    context.namehash = ethers_1.ethers.utils.namehash;
    context.sha256 = ethers_1.ethers.utils.sha256;
    context.parseEther = ethers_1.ethers.utils.parseEther;
    context.parseUnits = ethers_1.ethers.utils.parseUnits;
    context.formatEther = ethers_1.ethers.utils.formatEther;
    context.formatUnits = ethers_1.ethers.utils.formatUnits;
    context.randomBytes = ethers_1.ethers.utils.randomBytes;
    context.constants = ethers_1.ethers.constants;
    context.parseTransaction = ethers_1.ethers.utils.parseTransaction;
    context.serializeTransaction = ethers_1.ethers.utils.serializeTransaction;
    context.toUtf8Bytes = ethers_1.ethers.utils.toUtf8Bytes;
    context.toUtf8String = ethers_1.ethers.utils.toUtf8String;
}
var SandboxPlugin = /** @class */ (function (_super) {
    __extends(SandboxPlugin, _super);
    function SandboxPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "";
        return _this;
    }
    SandboxPlugin.prototype.prepare = function (opts) {
        return __awaiter(this, void 0, void 0, function () {
            var network;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.opts = opts;
                        return [4 /*yield*/, this.opts.provider.getNetwork()];
                    case 1:
                        network = _a.sent();
                        this._network = (network.name || 'unknown');
                        return [2 /*return*/];
                }
            });
        });
    };
    SandboxPlugin.prototype.run = function () {
        var opts = this.opts;
        console.log('network: ' + this._network + ' (chainId: ' + opts.provider.network.chainId + ')');
        var nextPromiseId = 0;
        function promiseWriter(output) {
            if (output instanceof Promise) {
                repl.context._p = output;
                var promiseId_1 = nextPromiseId++;
                output.then(function (result) {
                    console.log('\n<Promise id=' + promiseId_1 + ' resolved>');
                    console.log(util_1.default.inspect(result));
                    repl.displayPrompt(true);
                }, function (error) {
                    console.log('\n<Promise id=' + promiseId_1 + ' rejected>');
                    console.log(util_1.default.inspect(error));
                    repl.displayPrompt(true);
                });
                return '<Promise id=' + promiseId_1 + ' pending>';
            }
            return util_1.default.inspect(output);
        }
        var repl = repl_1.default.start({
            input: process.stdin,
            output: process.stdout,
            prompt: (opts.provider ? opts.provider.network.name : "no-network") + '> ',
            writer: promiseWriter
        });
        setupContext(repl.context, opts);
        return new Promise(function (resolve, reject) {
            repl.on('exit', function () {
                console.log('');
                resolve(null);
            });
        });
    };
    return SandboxPlugin;
}(cli_1.Plugin));
plugins[''] = new SandboxPlugin();
var InitPlugin = /** @class */ (function (_super) {
    __extends(InitPlugin, _super);
    function InitPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "FILENAME";
        return _this;
    }
    InitPlugin.prototype.prepare = function (opts) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (opts.args.length < 2) {
                    throw new Error('init requires FILENAME');
                }
                this.filename = opts.args[1];
                return [2 /*return*/, null];
            });
        });
    };
    InitPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                if (fs_1.default.existsSync(this.filename)) {
                    console.log('File already exists; cannot overwrite');
                    return [2 /*return*/, null];
                }
                console.log("Creating a new JSON Wallet - " + this.filename);
                console.log('Keep this password and file SAFE!! If lost or forgotten');
                console.log('it CANNOT be recovered, by ANYone, EVER.');
                return [2 /*return*/, cli_1.getPrompt("Choose a Password: ", { mask: '*' }).then(function (password) {
                        return cli_1.getPrompt("Confirm Password:  ", { mask: '*' }).then(function (confirmPassword) {
                            if (password !== confirmPassword) {
                                throw new Error('passwords did not match');
                            }
                            var wallet = ethers_1.ethers.Wallet.createRandom();
                            wallet.encrypt(password, {}, cli_1.getProgressBar('Encrypting')).then(function (json) {
                                try {
                                    fs_1.default.writeFileSync(_this.filename, json, { flag: 'wx' });
                                    console.log('New account address: ' + wallet.address);
                                    console.log('Saved:               ' + _this.filename);
                                }
                                catch (error) {
                                    if (error.code === 'EEXIST') {
                                        console.log('Filename already exists; cannot overwrite');
                                    }
                                    else {
                                        console.log('Unknown Error: ' + error.message);
                                    }
                                }
                            });
                        });
                    })];
            });
        });
    };
    return InitPlugin;
}(cli_1.Plugin));
plugins['init'] = new InitPlugin();
var InfoPlugin = /** @class */ (function (_super) {
    __extends(InfoPlugin, _super);
    function InfoPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "[ FILENAME_OR_ADDRESS_OR_NAME ]";
        return _this;
    }
    InfoPlugin.prototype.prepare = function (opts) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                this.opts = opts;
                if (opts.accounts.length) {
                    return [2 /*return*/, opts.accounts[0].getAddress().then(function (address) {
                            _this.address = address;
                            _this.query = 'Account:';
                        })];
                }
                if (opts.args.length === 2) {
                    try {
                        this.address = ethers_1.ethers.utils.getAddress(opts.args[1]);
                        this.query = 'Address: ' + this.address;
                        return [2 /*return*/, null];
                    }
                    catch (error) { }
                    if (opts.args[1].match(/\.eth$/)) {
                        return [2 /*return*/, opts.provider.resolveName(opts.args[1]).then(function (address) {
                                _this.address = address;
                                _this.query = 'Name: ' + opts.args[1];
                                return null;
                            })];
                    }
                    this.address = ethers_1.ethers.utils.getJsonWalletAddress(fs_1.default.readFileSync(opts.args[1]).toString());
                    this.query = 'File: ' + opts.args[1];
                    return [2 /*return*/, null];
                }
                return [2 /*return*/, null];
            });
        });
    };
    InfoPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var balance, nonce, code, reverse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.address) {
                            throw new Error('info requires an account or FILENAME');
                        }
                        console.log(this.query);
                        console.log('  Address:            ', this.address);
                        return [4 /*yield*/, this.opts.provider.getBalance(this.address)];
                    case 1:
                        balance = _a.sent();
                        console.log('  Balance:            ', ethers_1.ethers.utils.formatEther(balance));
                        return [4 /*yield*/, this.opts.provider.getTransactionCount(this.address)];
                    case 2:
                        nonce = _a.sent();
                        console.log('  Transaction Count:  ', nonce);
                        return [4 /*yield*/, this.opts.provider.getCode(this.address)];
                    case 3:
                        code = _a.sent();
                        if (code != '0x') {
                            console.log('  Code:               ', code);
                        }
                        return [4 /*yield*/, this.opts.provider.lookupAddress(this.address)];
                    case 4:
                        reverse = _a.sent();
                        if (reverse) {
                            console.log('  Reverse Lookup:     ', reverse);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    return InfoPlugin;
}(cli_1.Plugin));
plugins['info'] = new InfoPlugin();
var SendPlugin = /** @class */ (function (_super) {
    __extends(SendPlugin, _super);
    function SendPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "TO_ADDRESS ETHER";
        return _this;
    }
    SendPlugin.prototype.prepare = function (opts) {
        this.account = opts.accounts[0];
        if (!this.account) {
            throw new Error('send requires an account');
        }
        if (opts.args.length < 3) {
            throw new Error('send requires TO_ADDRESS and ETHER');
        }
        this.provider = opts.provider;
        this.amount = ethers_1.ethers.utils.parseEther(opts.args[2]);
        this.targetAddress = opts.args[1];
        return Promise.resolve(null);
    };
    SendPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var address;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        address = this.provider.resolveName(this.targetAddress);
                        if (address == null) {
                            throw new Error('unknown ENS name: ' + this.targetAddress);
                        }
                        return [4 /*yield*/, this.account.sendTransaction({
                                to: address,
                                value: this.amount
                            })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, null];
                }
            });
        });
    };
    return SendPlugin;
}(cli_1.Plugin));
plugins['send'] = new SendPlugin();
var SweepPlugin = /** @class */ (function (_super) {
    __extends(SweepPlugin, _super);
    function SweepPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "TO_ADDRESS";
        return _this;
    }
    SweepPlugin.prototype.prepare = function (opts) {
        this.provider = opts.provider;
        this.gasPrice = opts.gasPrice;
        this.account = opts.accounts[0];
        if (!this.account) {
            throw new Error('sweep requires an account');
        }
        if (opts.args.length < 2) {
            throw new Error('sweep requires TO_ADDRESS');
        }
        this.targetAddress = opts.args[1];
        return Promise.resolve(null);
    };
    SweepPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var address, code, balance, gasPrice, maxSpendable;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        address = this.provider.resolveName(this.targetAddress);
                        if (address == null) {
                            throw new Error('unknown ENS name: ' + this.targetAddress);
                        }
                        return [4 /*yield*/, this.provider.getCode(this.targetAddress)];
                    case 1:
                        code = _a.sent();
                        if (code !== '0x') {
                            throw new Error('sweep cannot send to a contract');
                        }
                        return [4 /*yield*/, this.provider.getBalance(this.account.getAddress())];
                    case 2:
                        balance = _a.sent();
                        gasPrice = this.gasPrice;
                        maxSpendable = balance.sub(gasPrice.mul(21000));
                        if (maxSpendable.lte(0)) {
                            throw new Error('insufficient funds to sweep');
                        }
                        return [2 /*return*/, this.account.sendTransaction({
                                to: this.targetAddress,
                                gasLimit: 21000,
                                gasPrice: this.gasPrice,
                                value: maxSpendable
                            }).then(function (tx) {
                                return null;
                            })];
                }
            });
        });
    };
    return SweepPlugin;
}(cli_1.Plugin));
plugins['sweep'] = new SweepPlugin();
var SignMessagePlugin = /** @class */ (function (_super) {
    __extends(SignMessagePlugin, _super);
    function SignMessagePlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "MESSAGE [ --hex ]";
        _this.options = { hex: 'treat strings as hex strings' };
        return _this;
    }
    SignMessagePlugin.prototype.prepare = function (opts) {
        this.account = opts.accounts[0];
        if (!this.account) {
            throw new Error('sign-message requires an account');
        }
        if (opts.args.length < 2) {
            throw new Error('sign-message requires MESSAGE');
        }
        this.message = opts.args[1];
        if (opts.options.hex) {
            this.message = ethers_1.ethers.utils.arrayify(this.message);
        }
        return Promise.resolve();
    };
    SignMessagePlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.account.signMessage(this.message);
                return [2 /*return*/, null];
            });
        });
    };
    return SignMessagePlugin;
}(cli_1.Plugin));
options['hex'] = false;
plugins['sign-message'] = new SignMessagePlugin();
var EvalPlugin = /** @class */ (function (_super) {
    __extends(EvalPlugin, _super);
    function EvalPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "SCRIPT";
        return _this;
    }
    EvalPlugin.prototype.prepare = function (opts) {
        if (opts.args.length != 2) {
            throw new Error('eval requires SCRIPT');
        }
        this.script = opts.args[1];
        this.context = {};
        setupContext(this.context, opts);
        return Promise.resolve();
    };
    EvalPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var context, script, result;
            return __generator(this, function (_a) {
                context = vm_1.default.createContext(this.context);
                script = new vm_1.default.Script(this.script, { filename: '-' });
                result = script.runInContext(context);
                if (!(result instanceof Promise)) {
                    result = Promise.resolve(result);
                }
                return [2 /*return*/, result.then(function (result) {
                        console.log(result);
                    })];
            });
        });
    };
    return EvalPlugin;
}(cli_1.Plugin));
plugins['eval'] = new EvalPlugin();
var RunPlugin = /** @class */ (function (_super) {
    __extends(RunPlugin, _super);
    function RunPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "FILENAME_JS";
        return _this;
    }
    RunPlugin.prototype.prepare = function (opts) {
        if (opts.args.length != 2) {
            throw new Error('run requires FILENAME_JS');
        }
        this.filename = opts.args[1];
        this.context = {};
        setupContext(this.context, opts);
        return Promise.resolve();
    };
    RunPlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var context, script, result;
            return __generator(this, function (_a) {
                context = vm_1.default.createContext(this.context);
                script = new vm_1.default.Script(fs_1.default.readFileSync(this.filename).toString(), { filename: this.filename });
                result = script.runInContext(context);
                if (!(result instanceof Promise)) {
                    result = Promise.resolve(result);
                }
                return [2 /*return*/, result.then(function (result) {
                        console.log(result);
                    })];
            });
        });
    };
    return RunPlugin;
}(cli_1.Plugin));
plugins['run'] = new RunPlugin();
cli_1.run(options, plugins);
