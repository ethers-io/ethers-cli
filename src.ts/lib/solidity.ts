"use strict";

import * as solidity from "solidity-parser-antlr";

function parseParameters(ast: any): string {
    if (ast.type !== "ParameterList") { throw new Error("not a parameter list"); }
    let params: Array<string> = [];
    ast.parameters.forEach((param: any) => {
        let signature = param.typeName.name;
        if (param.isIndexed) { signature += " indexed"; }
        if (param.name) { signature += " " + param.name; }
        params.push(signature);
    });
    return params.join(", ");
}

function parseContractDefinition(ast: any): { name: string, abi: Array<string> } {
    let contract: { name: string, abi: Array<string> } = { name: ast.name, abi: [] }
    ast.subNodes.forEach((ast: any) => {
        if (ast.type === "StateVariableDeclaration") {
            if (ast.variables.length !== 1) {
                console.log("Warning: StateVariableDeclaration variable length !== 1");
                return;
            }

            let variable = ast.variables[0];
            if (variable.visibility !== "default" && variable.visibility !== "public") {
                return;
            }
            if (variable.isStateVar !== true) { return; }
            if (variable.type !== "VariableDeclaration") {
                return;
            }
            contract.abi.push("function " + variable.name + "() view returns (" + variable.typeName.name + ")");

        } else if (ast.type === "FunctionDefinition") {
            if (ast.visibility !== "default" && ast.visibility !== "public") {
                return;
            }

            if (ast.isConstructor) {
                contract.abi.push("constructor(" + parseParameters(ast.parameters) + ")");

            } else {
                let signature = "function " + ast.name + "(" + parseParameters(ast.parameters) + ")";
                if (ast.stateMutability) {
                    signature = signature + " " + ast.stateMutability;
                }
                if (ast.returnParameters) {
                    signature += " returns (" + parseParameters(ast.returnParameters) + ")";
                }
                contract.abi.push(signature);
            }

        } else if (ast.type === "EventDefinition") {
            let signature = "event " + ast.name + "(" + parseParameters(ast.parameters) + ")";
            if (ast.isAnonymous) { signature += " anonymous"; }
            contract.abi.push(signature);

        } else {
            console.log("Unhandled:", ast);
        }
    });

    return contract;
}

function parseRoot(ast: any): Array<{ name: string, abi: Array<string> }> {
    if (ast.type !== "SourceUnit") {
        throw new Error("top not SourceUnit");
    }

    let contracts: Array<{ name: string, abi: Array<string> }> = [];

    (ast.children || []).forEach((contractDefinition: any) => {
        if (contractDefinition.type !== "ContractDefinition") {
            console.log("Skipping", contractDefinition);
            return;
        }
        contracts.push(parseContractDefinition(contractDefinition));
    });

    return contracts;
}

export type ContractAbi = { name: string, abi: Array<string> };

export function parse(source: string): Array<ContractAbi> {
    return parseRoot(solidity.parse(source));
}
