"use strict";

import { ethers } from "ethers";

import { ContractAbi } from "./solidity";

const opaque: { [name: string]: string } = {
    address: "string",
    string: "string"
}

function getType(type: string, flexible?: boolean): string {
    if (opaque[type]) { return opaque[type]; }

    let match = type.match(/^(u?int)([0-9]+)$/)
    if (match) {
        if (flexible) {
            return "ethers.utils.BigNumberish";
        }
        if (parseInt(match[2]) < 53) { return 'number'; }
        return 'ethers.utils.BigNumber';
    }

    match = type.match(/^bytes[0-9]*$/)
    if (match) {
        if (flexible) {
            return "string | ethers.utils.Arrayish";
        }
        return "string"
    }

    match = type.match(/^(.*)(\[[0-9]*\])$/);
    if (match) {
        return "Array<" + getType(match[1]) + ">";
    }

    throw new Error("unknown type");
    return null;
}

/*

function getPromise(type: string): string {
    return type + " | Promise<" + type + ">"
}

function getTypes(types: { [ name: string ]: string }): string {
    let params = [];
    for (let key in types) {
        params.push(key + "?: " + getPromise(types[key]) );
    }
    return "{ " + params.join(", ") + " }";
}

const CallOverrides = getTypes({ blockTag: "ethers.providers.BlockTag", from: "string" });

const txOverrides: { [ name: string ]: string } = {
    gasLimit: "ethers.utils.BigNumberish",
    gasPrice: "ethers.utils.BigNumberish",
    nonce: "ethers.utils.BigNumberish",
};
const TransactionOverrides = getTypes(txOverrides);

txOverrides.value = "ethers.utils.BigNumberish";
const PayableOverrides = getTypes(txOverrides);
*/

export const header = (function() {
    return [
        'import { ethers } from "ethers";',
        '',
        'export type CallOverrides = {',
        '    blockTag?: ethers.providers.BlockTag,',
        '    from?: string',
        '};',
        '',
        'export type TransactionOverrides = {',
        '    gasLimit?: ethers.utils.BigNumberish,',
        '    gasPrice?: ethers.utils.BigNumberish,',
        '    nonce?: ethers.utils.BigNumberish',
        '};',
        '',
        'export type PayableOverrides = {',
        '    gasLimit?: ethers.utils.BigNumberish,',
        '    gasPrice?: ethers.utils.BigNumberish,',
        '    nonce?: ethers.utils.BigNumberish,',
        '    value?: ethers.utils.BigNumberish',
        '};',
        '',
        ''
    ].join("\n");
})();

export function generate(contract: ContractAbi, bytecode?: string): string {
    let iface = new ethers.utils.Interface(contract.abi);

    let lines = [ ];

    let types: { [ name: string ]: boolean } = { };

    lines.push("export class " + contract.name + " extends ethers.Contract {");
    lines.push("");
    lines.push("    constructor(addressOrName: string, providerOrSigner: ethers.Signer | ethers.providers.Provider) {");
    lines.push("        super(addressOrName, " + contract.name + ".ABI(), providerOrSigner)");
    lines.push("    }");
    lines.push("");
    lines.push("    connect(providerOrSigner: ethers.Signer | ethers.providers.Provider): " + contract.name + " {");
    lines.push("        return new " + contract.name + "(this.address, providerOrSigner)");
    lines.push("    }");
    lines.push("");
    lines.push("    attach(addressOrName: string): " + contract.name + " {");
    lines.push("        return new " + contract.name + "(addressOrName, this.signer || this.provider)");
    lines.push("    }");

    for (let signature in iface.functions) {
        if (signature.indexOf('(') === -1) { continue; }
        let name = signature.split("(")[0];
        let descr = iface.functions[name];

        let output = "Promise<ethers.providers.TransactionResponse>";

        let overrides = "CallOverrides";
        if (descr.type === 'transaction') {
            if (descr.payable) {
                overrides = "PayableOverrides";
            } else {
                overrides = "TransactionOverrides";
            }
        } else if (descr.outputs.length > 0) {
            if (descr.outputs.length === 1) {
                output = "Promise<" + getType(descr.outputs[0].type) + ">";
            } else {
                //let outputs = [];
                //outputs = "Promise<Result>";
                throw new Error('unsupported');
            }
        }

        types[overrides] = true;

        let inputs: Array<string> = [];
        let passed: Array<string> = [];
        descr.inputs.forEach((input, index) => {
            let name = (input.name || ('p_' + index));
            let type = getType(input.type, true);
            inputs.push(name + ": " + type);
            passed.push(name);
        });
        inputs.push("_overrides?: " + overrides);
        passed.push("_overrides");

        lines.push("");
        lines.push("    " + name + "(" + inputs.join(', ') + "): " + output + " {");
        lines.push("        return this.functions." + name + "(" + passed.join(", ") + ");");
        lines.push("    }");
    }

    lines.push("");
    lines.push("    static factory(signer?: ethers.Signer): ethers.ContractFactory {");
    lines.push("        return new ethers.ContractFactory(" + contract.name + ".ABI(), " + contract.name + ".bytecode(), signer);");
    lines.push("    }");

    lines.push("");
    lines.push("    static bytecode(): string {");
    if (bytecode == null) {
        lines.push('        return ethers.errors.throwError("no bytecode provided during generation", errors.UNSUPPORTED_OPERATION, { operation: "contract.bytecode" });');
    } else {
        lines.push('        return "' + bytecode + '";');
    }
    lines.push("    }");

    lines.push("");
    lines.push("    static ABI(): Array<string> {");
    lines.push("        return [");
    for (let i = 0; i < contract.abi.length; i++) {
        lines.push("            " + JSON.stringify(contract.abi[i]) + ((i < contract.abi.length - 1) ? ",": ""));
    }
    lines.push("        ];");
    lines.push("    }");
    lines.push("}");
    let output = lines.join("\n") + "\n"

    return output;
}

