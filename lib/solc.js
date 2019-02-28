'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var ethers_1 = require("ethers");
var fs_1 = __importDefault(require("fs"));
var path_1 = require("path");
var _solc = null;
function getSolc() {
    if (!_solc) {
        _solc = require("solc");
    }
    return _solc;
}
;
function parseParameters(ast) {
    var params = [];
    ast.forEach(function (param) {
        var signature = param.type;
        if (param.isIndexed) {
            signature += " indexed";
        }
        if (param.name) {
            signature += " " + param.name;
        }
        params.push(signature);
    });
    return params.join(", ");
}
function compile(source, options) {
    options = ethers_1.ethers.utils.shallowCopy(options || {});
    if (options.filename && !options.basedir) {
        options.basedir = path_1.dirname(options.filename);
    }
    if (!options.filename) {
        options.filename = "_contract.sol";
    }
    if (!options.basedir) {
        options.basedir = ".";
    }
    var sources = {};
    sources[options.filename] = { content: source };
    var input = {
        language: "Solidity",
        sources: sources,
        settings: {
            outputSelection: {
                "*": {
                    "*": ["*"]
                }
            }
        }
    };
    if (options.optimize) {
        input.settings.optimizer = {
            enabled: true,
            runs: 200
        };
    }
    var findImport = function (filename) {
        try {
            return {
                contents: fs_1.default.readFileSync(path_1.resolve(options.basedir, options.filename)).toString()
            };
        }
        catch (error) {
            return { error: error.message };
        }
    };
    var output = JSON.parse(getSolc().compile(JSON.stringify(input), findImport));
    var errors = (output.errors || []).filter(function (x) { return (x.severity === "error"); }).map(function (x) { return x.formattedMessage; });
    if (errors.length) {
        var error = new Error("compilation error");
        error.errors = errors;
        throw error;
    }
    var result = [];
    for (var filename in output.contracts) {
        var _loop_1 = function (name_1) {
            var contract = output.contracts[filename][name_1];
            var abi = [];
            contract.abi.forEach(function (ast) {
                if (ast.type === "function") {
                    var signature = "function " + ast.name + "(" + parseParameters(ast.inputs) + ")";
                    if (ast.stateMutability !== "nonpayable") {
                        signature = signature + " " + ast.stateMutability;
                    }
                    if (ast.outputs.length) {
                        signature += " returns (" + parseParameters(ast.outputs) + ")";
                    }
                    abi.push(signature);
                }
                else if (ast.type === "event") {
                    var signature = "event " + ast.name + "(" + parseParameters(ast.inputs) + ")";
                    if (ast.anonymous) {
                        signature += " anonymous";
                    }
                    abi.push(signature);
                }
                else if (ast.type === "constructor") {
                    abi.push("constructor(" + parseParameters(ast.inputs) + ")");
                }
            });
            result.push({
                name: name_1,
                abi: abi,
                bytecode: "0x" + contract.evm.bytecode.object
            });
        };
        for (var name_1 in output.contracts[filename]) {
            _loop_1(name_1);
        }
    }
    return result;
}
exports.compile = compile;
