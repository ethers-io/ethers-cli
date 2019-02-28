"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var solidity = __importStar(require("solidity-parser-antlr"));
function parseParameters(ast) {
    if (ast.type !== "ParameterList") {
        throw new Error("not a parameter list");
    }
    var params = [];
    ast.parameters.forEach(function (param) {
        var signature = param.typeName.name;
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
function parseContractDefinition(ast) {
    var contract = { name: ast.name, abi: [] };
    ast.subNodes.forEach(function (ast) {
        if (ast.type === "StateVariableDeclaration") {
            if (ast.variables.length !== 1) {
                console.log("Warning: StateVariableDeclaration variable length !== 1");
                return;
            }
            var variable = ast.variables[0];
            if (variable.visibility !== "default" && variable.visibility !== "public") {
                return;
            }
            if (variable.isStateVar !== true) {
                return;
            }
            if (variable.type !== "VariableDeclaration") {
                return;
            }
            contract.abi.push("function " + variable.name + "() view returns (" + variable.typeName.name + ")");
        }
        else if (ast.type === "FunctionDefinition") {
            if (ast.visibility !== "default" && ast.visibility !== "public") {
                return;
            }
            if (ast.isConstructor) {
                contract.abi.push("constructor(" + parseParameters(ast.parameters) + ")");
            }
            else {
                var signature = "function " + ast.name + "(" + parseParameters(ast.parameters) + ")";
                if (ast.stateMutability) {
                    signature = signature + " " + ast.stateMutability;
                }
                if (ast.returnParameters) {
                    signature += " returns (" + parseParameters(ast.returnParameters) + ")";
                }
                contract.abi.push(signature);
            }
        }
        else if (ast.type === "EventDefinition") {
            var signature = "event " + ast.name + "(" + parseParameters(ast.parameters) + ")";
            if (ast.isAnonymous) {
                signature += " anonymous";
            }
            contract.abi.push(signature);
        }
        else {
            console.log("Unhandled:", ast);
        }
    });
    return contract;
}
function parseRoot(ast) {
    if (ast.type !== "SourceUnit") {
        throw new Error("top not SourceUnit");
    }
    var contracts = [];
    (ast.children || []).forEach(function (contractDefinition) {
        if (contractDefinition.type !== "ContractDefinition") {
            console.log("Skipping", contractDefinition);
            return;
        }
        contracts.push(parseContractDefinition(contractDefinition));
    });
    return contracts;
}
function parse(source) {
    return parseRoot(solidity.parse(source));
}
exports.parse = parse;
