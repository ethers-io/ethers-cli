'use strict';

var crypto = require('crypto');
var fs = require('fs');

var readlineSync = require('readline-sync');
var Wallet = require('ethers-wallet');

var signing = require('./lib/signing.js');
var Slug = require('./lib/slug.js');
var utils = require('./lib/utils.js');
var version = require('./package.json').version;

// The command being run (eg. init)
var command = '';

// The account JSON wallet
var jsonAccount = null;

// The unlocked account
var account = null;


function getPassword(message) {
    if (!message) { message = 'Account Password: '; }
    var password = readlineSync.question(message, {hideEchoBack: true});
    password = password.normalize('NFKC');
    return new Buffer(password);
}

function getAccount() {
    var password = getPassword();
    return Wallet.decrypt(jsonAccount, password);
}

function showHelp(error) {
    console.log('');
    console.log('Command Line Interface - ethers.space/' + version);
    console.log('');
    console.log('Usage');
    console.log('    ethers init');
    console.log('    ethers push ALIAS_NAME');
    console.log('');
    console.log('        --help          show this help screen');
    console.log('        --version       show the software version');
    console.log('');
    console.log('    Commands:');
    console.log('        init       creates a new account.json');
    console.log('        push       publishes content');
    console.log('');

    if (error.message !== '') {
        console.log(error.message);
        console.log('');
        process.exit(1);
    }

    process.exit();
}

try {
    var opts = utils.getopts({
    }, {
        help: false,
        version: false,
    });

    if (opts.flags.help) { throw new Error(''); }

    if (opts.flags.version) {
        console.log('ethers.space/' + version);
        process.exit();
    }

    if (opts.args.length === 0) { throw new Error('No command specified.'); }
    command = opts.args.shift();

    function ensureArgs(count) {
        if (opts.args.length !== count) {
            throw new Error('Invalid arguments for `' + command + '`.');
        }
    }

    // Load any existing account JSON
    try {
        jsonAccount = fs.readFileSync('./account.json');
        if (!Wallet.isValidWallet(jsonAccount)) {
            console.log('WARNING: invalid account.json format');
        }
    } catch (error) { }

    // Various checks for the command
    switch (command) {
        case 'init':
            ensureArgs(0);
            break;

        case 'push':
            ensureArgs(1);
            break;

        default:
            throw new Error('Unknown command: ' + command);
    }

} catch (error) {
    showHelp(error);
}

switch (command) {
    case 'init':
        if (jsonAccount) {
            console.log('Cannot `init`. Account already exists (account.json).');
            process.exit(1);
        }

        (function() {
            // Generate a new private key
            var privateKey = '0x' + crypto.randomBytes(32).toString('hex');
            var wallet = new Wallet(privateKey);

            // Get a password from the user
            console.log('Do NOT lose or forget this password. It cannot be reset.');
            var password = getPassword('New Account Password: ');
            var confirmPassword = getPassword('Confirm Password: ');
            if (Buffer.compare(password, confirmPassword) !== 0) {
                console.log('Passwords did NOT match. Aborting.');
                return;
            }

            // Encrypt the account and save it to disk
            console.log('Encrypting Account... (this may take a few seconds)');
            wallet.encrypt(password).then(function(json) {
                try {
                    fs.writeFileSync('account.json', json, {flag: 'wx'});
                    console.log('Account successfully created. Keep this file SAFE. Do NOT check it into source control.');
                } catch (error) {
                    console.log('Error saving account.js: ' + error.message);
                }
            }, function(error) {
                console.log('Error encrypting account: ' + error.message);
            });
        })();
        break;

    case 'push':
        if (!jsonAccount) {
            console.log('Command `push` requires an account (use `ethers init` first.)');
            process.exit(1);
        }

        getAccount().then(function(wallet) {
            var alias = opts.args.shift();

            console.log('Finding files...');
            Slug.generate().then(function(slug) {
                var payload = slug.sign(wallet.privateKey);
                var slug2 = Slug.verify(payload);
                console.log(slug2.json === slug.json);
            }, function(error) {
                console.log('Error deploying slug: ' + error.message);
            });

        }, function(error) {
            if (error.message === 'invalid password') {
                console.log('Error: Invalid password');
            } else {
                console.log('Error decrypting account: ' + error.message);
            }
        });

        break;
}
/**
 *
 *  ethers init
 *  ethers [--testnet] status (shows address)
 *  ethers [--testnet] register ALIAS
 *  ethers [--testnet] extend ALIAS
 *
 *  ethers init (creates new account.json)
 *  ethers push ALIAS
 *
 *  Future:
 *      ethers pull ALIAS
 *
 */
