'use strict';

import { ethers } from "ethers";
import fs from "fs";
import { dirname, resolve } from "path";

let _solc: any = null;
function getSolc(): any {
    if (!_solc) {
        _solc = require("solc");
    }
    return _solc;
}

export interface ContractCode {
    abi: Array<string>;
    bytecode: string;
    name: string;
};

function parseParameters(ast: Array<any>): string {
    let params: Array<string> = [];
    ast.forEach((param: any) => {
        let signature = param.type;
        if (param.isIndexed) { signature += " indexed"; }
        if (param.name) { signature += " " + param.name; }
        params.push(signature);
    });
    return params.join(", ");
}

export type CompilerOptions = {
    filename?: string;
    basedir?: string;
    optimize?: boolean;
};

export function compile(source: string, options?: CompilerOptions): Array<ContractCode> {
    options = ethers.utils.shallowCopy(options || { });

    if (options.filename && !options.basedir) {
        options.basedir = dirname(options.filename);
    }
    if (!options.filename) { options.filename = "_contract.sol"; }
    if (!options.basedir) { options.basedir = "."; }

    let sources: { [ filename: string]: { content: string } } = { };
    sources[options.filename] = { content: source };

    let input: any = {
        language: "Solidity",
        sources: sources,
        settings: {
            outputSelection: {
                "*": {
                    "*": [ "*" ]
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

    let findImport = (filename: string): { contents?: string, error?: string } => {
        try {
            return {
                contents: fs.readFileSync(resolve(options.basedir, options.filename)).toString()
            };
        } catch (error) {
            return { error: error.message }
        }
    };

    let output = JSON.parse(getSolc().compile(JSON.stringify(input), findImport));
    let errors = (output.errors || []).filter((x: any) => (x.severity === "error")).map((x: any) => x.formattedMessage);
    if (errors.length) {
        let error = new Error("compilation error");
        (<any>error).errors = errors;
        throw error;
    }

    let result: Array<ContractCode> = [];
    for (let filename in output.contracts) {
        for (let name in output.contracts[filename]) {
            let contract = output.contracts[filename][name];

            let abi: Array<string> = [];
            contract.abi.forEach((ast: any) => {
                if (ast.type === "function") {
                    let signature = "function " + ast.name + "(" + parseParameters(ast.inputs) + ")";
                    if (ast.stateMutability !== "nonpayable") {
                        signature = signature + " " + ast.stateMutability;
                    }
                    if (ast.outputs.length) {
                        signature += " returns (" + parseParameters(ast.outputs) + ")";
                    }
                    abi.push(signature);
                } else if (ast.type === "event") {
                    let signature = "event " + ast.name + "(" + parseParameters(ast.inputs) + ")";
                    if (ast.anonymous) { signature += " anonymous"; }
                    abi.push(signature);
                } else if (ast.type === "constructor") {
                    abi.push("constructor(" + parseParameters(ast.inputs) + ")");
                }
            });

            result.push({
                name: name,
                abi: abi,
                bytecode: "0x" + contract.evm.bytecode.object
            });
        }
    }

    return result;
}
