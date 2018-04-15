'use strict';

// @TODO:
// - Events need to be tracked

var fs = require('fs');
var inherits = require('util').inherits;

var ethers = require('ethers');

var readlineSync = require('readline-sync');

var compiler = require('./compiler');
var TestProvider = require('./test-provider');

var Pocket = require('./pocket')

// @TODO: Add this to ethers.providers
function WaitingProvider(provider) {
    this.provider = provider;
}
ethers.providers.Provider.inherits(WaitingProvider);

ethers.utils.defineProperty(WaitingProvider, 'perform', function(method, params) {
    var provider = this.provider;
    if (method === 'sendTransaction') {
        return provider.perform(method, params).then(function(tx) {
            return provider.waitForTransaction(tx.hash);
        });
    }
    return provider.perform(method, params);
});


function Builder(provider, accounts, deploy, options) {
    if (!(this instanceof Builder)) { throw new Error('missing new'); }

    if (!options) { options = { }; }
    if (options.showDeployments == null) { options.showDeployments = true; }

    this.options = options;

    this.provider = provider;
    this.accounts = accounts.slice();
    this.account = accounts[0];

    this._deploy = deploy;

    this.deployed = null;

    this.deployments = {};
    this.logs = [];

    this._compile = compiler.compile;
}

Builder.prototype.saveContract = Pocket.saveContract;

Builder.prototype.compile = function(filename, optimize) {

    // Compile the source and throw any errors
    try {
        var output = this._compile(filename, optimize);
    } catch(error) {
        if (error.errors) {
            error.errors.forEach(function(error) {
                console.log('Error: ' + error.filename + ':' + error.row + ':' + error.column + ': ' + error.message);
                if (error.code) {
                    error.code.split('\n').forEach(function(line) {
                        console.log('    ' + line);
                    });
                }
            });
        } else {
            console.log(error);
        }
        throw error;
    }

    var doneWarnings = {};
    var warnings = [];
    var deployed = [];

    var self = this;

    Object.keys(output).forEach(function(name) {
        var code = output[name];
        code.deploy = function() {
            var account = self.account;
            var tx = code.getDeployTransaction.apply(code, Array.prototype.slice.call(arguments));
            if (self.gasLimit) {
                tx.gasLimit = 2500000;
            }

            return account.sendTransaction(tx).then(function(tx) {
                var address = ethers.utils.getContractAddress(tx);
                if (self.options.showDeployments) {
                    console.log('Deployed: ' + name + ' (' + code.source.filename + ')');
                    console.log('    Transaction Hash: ' + tx.hash);
                    console.log('    Contract Address: ' + address);
                    console.log('    Bytecode:         ' + code.bytecode);
                    console.log('    Arguments:        ' + '0x' + tx.data.substring(code.bytecode.length));
                    console.log('    Interface:        ' + code.jsonInterface);
                }

                var contract = code.connect(address, account);

                contract._jsonInterface = code.jsonInterface;

                self.deployments[name] = contract;

                self.logs.push({
                    account: account,
                    address: address,
                    action: 'deploy',
                    code: code,
                    tx: tx,
                });

                return contract;
            });
        }

        code.warnings.forEach(function(warning) {
            if (doneWarnings[warning.uid]) { return; }
            warnings.push(warning);
        });

        code.relatedWarnings.forEach(function(warning) {
            if (doneWarnings[warning.uid]) { return; }
            warnings.push(warning);
        });
    });

    warnings.forEach(function(warning) {
        console.log('Warning: ' + warning.filename + '::' + warning.row + ':' + warning.column + ': ' + warning.message);
        if (warning.code) {
            warning.code.split('\n').forEach(function(line) {
                console.log('    ' + line);
            });
        }
    });

    return output;
}

Builder.prototype.deploy = function() {
    var self = this;

    var args = Array.prototype.slice.call(arguments);
    args.unshift(self);

    // May only deploy once
    if (self._deployed) { throw new Error('deployment already executed'); }
    self._deployed = true;

    // Make sure the provider is ready before calling deploy
    return self.provider.getBlockNumber().then(function() {
        var result = self._deploy.apply(self, args);
        if (result instanceof Promise) {
            return result.then(function(result) {
                self.deployed = result
                return result;
            });
        } else {
            return result;
        }
    });
}

function TestBuilder(deploy, options) {
    if (!(this instanceof TestBuilder)) { return new TestBuilder(deploy); }

    if (!options) { options = { }; }
    if (options.showDelpoyments == null) { options.showDeployments = false; }

    var accounts = [];
    for (var i = 0; i < 25; i++) {
        accounts.push(new ethers.Wallet(ethers.utils.randomBytes(32)));
    }

    var provider = new TestProvider(accounts);

    //(new compiler.TestCompiler(accounts[0])).compile;
    Builder.call(this, provider, accounts, deploy, options);

    this._compile = compiler.testCompile;
    this.gasLimit = 2500000;
}
inherits(TestBuilder, Builder);

// We don't want testing to write to disk
TestBuilder.prototype.saveContract = function() { }

TestBuilder.prototype.compile = function(filename, optimize) {
    var result = Builder.prototype.compile.call(this, filename, optimize);
    delete result.DebugPrinter;
    return result;
}

module.exports = {
    Builder: Builder,
    TestBuilder: TestBuilder,
}

