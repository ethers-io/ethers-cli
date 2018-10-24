'use strict';

var fs = require('fs');

var errors = require('ethers/utils/errors');
var utils = require('ethers/utils');

function Pocket(filename) {
    errors.checkNew(this, Pocket);
    utils.defineProperty(this, 'filename', filename);
}

utils.defineProperty(Pocket.prototype, '_load', function() {
    try {
        var data = fs.readFileSync(this.filename);
    } catch (error) {
        if (error.code === 'ENOENT') {
            data = '{}';
        } else {
            throw error;
        }
    }

    try {
        data = JSON.parse(data.toString());
    } catch (error) {
        throw new Error('invalid JSON file');
    }

    return data;
});

utils.defineProperty(Pocket.prototype, 'getValue', function(network, key, defaultValue) {
    var data = this._load();
    if (!data[network]) { return null; }
    var value = data[network][key];
    if (value == null) {
        if (defaultValue != null) {
            value = defaultValue;
        } else {
            value = null;
        }
    }
    return value;
});

utils.defineProperty(Pocket.prototype, 'setValues', function(network, values) {
    var data = this._load();
    if (!data[network]) { data[network] = { }; }
    for (var key in values) {
        data[network][key] = values[key];
    }
    fs.writeFileSync(this.filename, JSON.stringify(data));
});

utils.defineProperty(Pocket.prototype, 'setValue', function(network, key, value) {
    var values = { };
    values[key] = value;
    this.setValues(values);
});

/*
function jsonify(contract) {
    var abi = [];
    Object.keys(contract.interface.functions).forEach(function(name) {
        var func = contract.interface.functions[name];
        if (func.indexOf('(') === -1) { continue; }
        abi.push({
            name: name
            inputs:
            outputs:
            type: 'function',
            payable: func.payable
        });
    });
}
*/

utils.defineProperty(Pocket, 'saveContract', function(filename, contract) {
    var pocket = new Pocket(filename);
    pocket.setValues(contract.provider.name, {
        address: contract.address,
        interface: contract._jsonInterface
    });
});

module.exports = Pocket;
