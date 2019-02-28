"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ethers_1 = require("ethers");
var opaque = {
    address: "string",
    string: "string"
};
function getType(type, flexible) {
    if (opaque[type]) {
        return opaque[type];
    }
    var match = type.match(/^(u?int)([0-9]+)$/);
    if (match) {
        if (flexible) {
            return "ethers.utils.BigNumberish";
        }
        if (parseInt(match[2]) < 53) {
            return 'number';
        }
        return 'ethers.utils.BigNumber';
    }
    match = type.match(/^bytes[0-9]*$/);
    if (match) {
        if (flexible) {
            return "string | ethers.utils.Arrayish";
        }
        return "string";
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
exports.header = (function () {
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
function generate(contract, bytecode) {
    var iface = new ethers_1.ethers.utils.Interface(contract.abi);
    var lines = [];
    var types = {};
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
    var _loop_1 = function (signature) {
        if (signature.indexOf('(') === -1) {
            return "continue";
        }
        var name_1 = signature.split("(")[0];
        var descr = iface.functions[name_1];
        var output_1 = "Promise<ethers.providers.TransactionResponse>";
        var overrides = "CallOverrides";
        if (descr.type === 'transaction') {
            if (descr.payable) {
                overrides = "PayableOverrides";
            }
            else {
                overrides = "TransactionOverrides";
            }
        }
        else if (descr.outputs.length > 0) {
            if (descr.outputs.length === 1) {
                output_1 = "Promise<" + getType(descr.outputs[0].type) + ">";
            }
            else {
                //let outputs = [];
                //outputs = "Promise<Result>";
                throw new Error('unsupported');
            }
        }
        types[overrides] = true;
        var inputs = [];
        var passed = [];
        descr.inputs.forEach(function (input, index) {
            var name = (input.name || ('p_' + index));
            var type = getType(input.type, true);
            inputs.push(name + ": " + type);
            passed.push(name);
        });
        inputs.push("_overrides?: " + overrides);
        passed.push("_overrides");
        lines.push("");
        lines.push("    " + name_1 + "(" + inputs.join(', ') + "): " + output_1 + " {");
        lines.push("        return this.functions." + name_1 + "(" + passed.join(", ") + ");");
        lines.push("    }");
    };
    for (var signature in iface.functions) {
        _loop_1(signature);
    }
    lines.push("");
    lines.push("    static factory(signer?: ethers.Signer): ethers.ContractFactory {");
    lines.push("        return new ethers.ContractFactory(" + contract.name + ".ABI(), " + contract.name + ".bytecode(), signer);");
    lines.push("    }");
    lines.push("");
    lines.push("    static bytecode(): string {");
    if (bytecode == null) {
        lines.push('        return ethers.errors.throwError("no bytecode provided during generation", errors.UNSUPPORTED_OPERATION, { operation: "contract.bytecode" });');
    }
    else {
        lines.push('        return "' + bytecode + '";');
    }
    lines.push("    }");
    lines.push("");
    lines.push("    static ABI(): Array<string> {");
    lines.push("        return [");
    for (var i = 0; i < contract.abi.length; i++) {
        lines.push("            " + JSON.stringify(contract.abi[i]) + ((i < contract.abi.length - 1) ? "," : ""));
    }
    lines.push("        ];");
    lines.push("    }");
    lines.push("}");
    var output = lines.join("\n") + "\n";
    return output;
}
exports.generate = generate;
