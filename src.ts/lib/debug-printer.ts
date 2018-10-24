'use strict';

var ethers = require('ethers');

var printers = [
    'address',
//    'bytes',
    'string',
    'bytes32',
    'uint256',
    'int256'
];
/*
for (var i = 1; i < 33; i++) {
    printers.push('uint' + (i * 8));
    printers.push('int' + (i * 8));
    / *
    if (i > 30) {
        printers.push('bytes' + i);
    }
    * /
}
*/
printers.sort();

var lines = [];
var lookup = {};


function signatureHash(text) {
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(text)).substring(0, 10);
}

lines.push('    function locate(string,uint32) public pure returns (bool);');

var sigLocate = signatureHash('locate(string,uint32)');

printers.forEach(function(kind) {
    var signature = 'print(uint32,' + kind + ')';
    lines.push('    function ' + signature + ' public pure returns (bool success) { return true; }');
    lookup[signatureHash(signature)] = kind;
});

function lpad(text, length) {
    while (text.length < length) { text += ' '; }
    return text;
}

    /*
function repr() {
    if (typeof(value.data) === 'string') {
        var text = escape(value.data);
        text = text.replace(/%([0-9A-Fa-f]{2})/g, function(match, p1, offset, all) {
            switch(p1) {
                case '0a': return '\\n';
                case '0d': return '\\r';
                case '20': return ' ';
            }
            return '\x' + p1.toLowerCase();
        }
        value.data = text;
    }
}
    */


function DebugPrinter() {
    if (!(this instanceof DebugPrinter)) { throw new Error('missing new'); }
    this.state = { line: null, filename: null, method: null };
}



DebugPrinter.prototype.process = function(data) {
    var data = '0x' + data.toString('hex');
    var sig = data.substring(0, 10);

    if (sig === sigLocate) {
        var kind = null;
        var value = ethers.utils.AbiCoder.defaultCoder.decode([ 'where', 'line' ], [ 'string', 'uint32' ], '0x' + data.substring(10));
        var comps = value.where.split(':');
        this.state = {
            line: value.line,
            filename: comps[0],
            method: comps[1],
        };
    } else {
        var kind = lookup[sig];
        var value = ethers.utils.AbiCoder.defaultCoder.decode([ 'line', 'data' ], [ 'uint32', kind ], '0x' + data.substring(10));
        // @TODO: Escape the string (newlines and whatnot); must be a library that does this safely
        if (value.data.toHexString) { value.data = value.data.toHexString(); }
    }

    return {
        data: value.data,
        type: kind,
        line: value.line
    }
}

var account = new ethers.Wallet('0x0000000000000000000000000000000000000000000000000000000000000001');

DebugPrinter.contract = 'contract DebugPrinter {\n' + lines.join('\n') + '\n}';
DebugPrinter.account = account;

//console.log(DebugPrinter.contract);

// Empty contract
var bytecode = '0x60606040523415600e57600080fd5b5b603680601c6000396000f30060606040525b600080fd00a165627a7a723058202ff35d084602377259483136d16822959b9173b78356721e820b6787bb4952280029';
var abi = [];
var deployTransaction = ethers.Contract.getDeployTransaction(bytecode, abi);
deployTransaction.from = account.address;
deployTransaction.gasLimit = 1500000;
deployTransaction.gasPrice = 100000000000;
deployTransaction.nonce = 0;

DebugPrinter.deployTransaction = account.sign(deployTransaction);

DebugPrinter.address = ethers.utils.getContractAddress(deployTransaction);

module.exports = DebugPrinter;
