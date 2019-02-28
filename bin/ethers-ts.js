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
var path_1 = require("path");
var ethers_1 = require("ethers");
var cli_1 = require("../lib/cli");
var typescript_1 = require("../lib/typescript");
var solc_1 = require("../lib/solc");
function computeHash(content) {
    var bareContent = content.replace(/\/\*\* Content Hash: 0x[0-9A-F]{64} \*\//i, '/** Content Hash: */');
    return ethers_1.ethers.utils.id(bareContent);
}
function checkHash(content) {
    var match = content.match(/\/\*\* Content Hash: (0x[0-9A-F]{64}) \*\//i);
    return (match && match[1] === computeHash(content));
}
function addContentHash(content) {
    var contentHash = computeHash("/** Content Hash: */\n" + content);
    return "/** Content Hash: " + contentHash + " */\n" + content;
}
function save(path, content, force) {
    if (fs_1.default.existsSync(path) && !force) {
        var oldContent = fs_1.default.readFileSync(path).toString();
        if (!checkHash(oldContent)) {
            return false;
        }
    }
    fs_1.default.writeFileSync(path, content);
    return true;
}
function walkFilenames(filenames) {
    var result = [];
    filenames.forEach(function (filename) {
        var stat = fs_1.default.statSync(filename);
        if (stat.isDirectory()) {
            walkFilenames(fs_1.default.readdirSync(filename).map(function (x) { return path_1.join(filename, x); })).forEach(function (filename) {
                result.push(filename);
            });
        }
        else if (stat.isFile()) {
            result.push(filename);
        }
    });
    return result;
}
var options = {
    _name: 'ethers-ts'
};
var plugins = {};
var GeneratePlugin = /** @class */ (function (_super) {
    __extends(GeneratePlugin, _super);
    function GeneratePlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.help = "FILENAME [ FILENAME ... ]";
        _this.options = {
            force: "Force overwriting modified files (not recommended)",
            unoptimized: "Do not run the optimizer",
            output: "Target filename or folder to save .ts to"
        };
        return _this;
    }
    GeneratePlugin.prototype.prepare = function (opts) {
        if (opts.args.length < 2) {
            throw new Error('generate requires at least one FILENAME');
        }
        this.filenames = opts.args.slice(1);
        this.output = opts.options.output || null;
        this.force = opts.options.force;
        this.optimize = !opts.options.unoptimized;
        return Promise.resolve(null);
    };
    GeneratePlugin.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var output, success;
            var _this = this;
            return __generator(this, function (_a) {
                output = typescript_1.header;
                walkFilenames(this.filenames).forEach(function (filename) {
                    if (!filename.match(/\.sol$/)) {
                        return;
                    }
                    var contracts = null;
                    var content = fs_1.default.readFileSync(filename).toString();
                    try {
                        contracts = solc_1.compile(content, { filename: filename, optimize: _this.optimize });
                    }
                    catch (error) {
                        console.log(error);
                        if (error.errors) {
                            error.errors.forEach(function (error) {
                                console.log(error);
                            });
                        }
                        throw new Error("errors during compilation");
                    }
                    contracts.forEach(function (contract) {
                        output += typescript_1.generate(contract, contract.bytecode);
                        output += "\n";
                    });
                });
                output = addContentHash(output.trim());
                if (this.output) {
                    success = save(this.output, output, this.force);
                    if (!success) {
                        return [2 /*return*/, Promise.reject(new Error("File has been modified; use --force"))];
                    }
                }
                else {
                    console.log(output);
                }
                return [2 /*return*/, Promise.resolve(null)];
            });
        });
    };
    return GeneratePlugin;
}(cli_1.Plugin));
plugins['generate'] = new GeneratePlugin();
options.force = false;
options.unopimized = false;
options.output = "";
cli_1.run(options, plugins);
