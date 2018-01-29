'use strict';

var fs = require('fs');
var path = require('path');
var util = require('util');

var ethers = require('ethers');

var solc = null;

var DebugPrinter = require('./debug-printer');

function keccak(text) {
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(text));
}

function countChar(text, character) {
    return text.split(character).length - 1;
}

function CompileWarning() { }
function CompileError() { }

function populate(kind, params) {
    var message = params.message, code = null;
    var nl = message.indexOf('\n');
    if (nl >= 0) {
        params.code = message.substring(nl + 1);
        params.message = message.substring(0, nl);
    }

    var result = new kind();
    for (var key in params) {
        result[key] = params[key];
    }
    return result;
}

function parseError(text) {
    var uid = keccak(text);
    var match = text.match(/^([^:]*):([0-9]+):([0-9]+): Warning: ((.|\n)*)$/);
    if (match) {
        return populate(CompileWarning, {
            column: parseInt(match[3]),
            filename: match[1],
            message: match[4],
            row: parseInt(match[2]),
            type: 'Warning',
            uid: uid
        });
    }

    var match = text.match(/^([^:]*):([0-9]+):([0-9]+): (\S*Error): ((.|\n)*)$/);
    if (match) {
        return populate(CompileError, {
            column: parseInt(match[3]),
            filename: match[1],
            message: match[5],
            row: parseInt(match[2]),
            type: match[4],
            uid: uid
        });
    }

    return populate(CompileError, { message: text, uid: uid });
}


function Source(filename, source) {
    this.filename = filename;
    this.source = source;
    this.code = [];
}

Source.prototype.inspect = function(depth, opts) {
    return "[source]";
}


function Code(name, bytecode, contractInterface, source) {
    if (!(this instanceof Code)) { throw new Error('missing new'); }

    this.name = name;
    this.bytecode = bytecode;
    this.jsonInterface = contractInterface;
    this.interface = new ethers.Interface(contractInterface);

    this.source = source || (new Source(null, null));
    this.source.code.push(this);
}

Code.prototype.inspect = function(depth, opts) {
    if (depth === 0) { return "[Code " + this.name + "]"; }

    function Code() { }
    var code = new Code();

    code.name = this.name;
    code.bytecode = this.bytecode;
    code.jsonInterface = this.jsonInterface;

    if (depth === 1) {
        if (code.bytecode.length > 32) {
            code.bytecode = code.bytecode.substring(0, 28) + ' ...';
        }
        if (code.jsonInterface.length > 32) {
            code.jsonInterface = code.jsonInterface.substring(0, 28) + ' ...';
        }
    }
    code.interface = this.interface;
    code.source = this.source;

    return code;

    /*

    return 'Code ' + util.inspect({
        name: this.name,
        bytecode: bytecodeShort,
    }, { depth: depth });
    */
}

Code.prototype.connect = function(address, providerOrSigner) {
    return new ethers.Contract(address, this.interface, providerOrSigner)
}

Code.prototype.getDeployTransaction = function() {
    var args = [ this.bytecode, this.interface ];
    Array.prototype.forEach.call(arguments, function(arg) {
        args.push(arg);
    });
    return ethers.Contract.getDeployTransaction.apply(ethers.Contract, args);
}



var solidity = {

    // Expose the raw compiler, in case that's what the user really wants
    _compile: function() {
        if (!solc) {
            solc = require('solc');
        }
        return solc.compile.apply(solc, Array.prototype.slice.call(arguments));
    },

    // Experimental; this will change
    compile: function(sources, optimize, loadSource) {
        function loadImport(filename) {
            if (filename.match(/\.sol$/)) {
                try {
                    return { contents: loadSource(filename) };
                } catch (error) {
                    console.log('Error loading file:', error);
                }
            }
            return { error: 'File not found' }
        }

        var output = solidity._compile({ sources: sources }, (optimize ? 1: 0), loadImport);

        var result = { errors: [], warnings: [] };

        var warningLookup = {}
        if (output.errors) {
            output.errors.forEach(function(error) {
                error = parseError(error);
                if (error instanceof CompileWarning) {
                    result.warnings.push(error);
                    if (!warningLookup[error.filename]) { warningLookup[error.filename] = []; }
                    warningLookup[error.filename].push(error);
                } else {
                    result.errors.push(error);
                }
            });
        }

        result.sources = {};
        result.code = [];
        Object.keys(output.contracts).forEach(function(contractName) {
            var contract = output.contracts[contractName];
            var comps = contractName.split(':');
            var filename = comps[0], name = comps[1];

            var source = result.sources[filename];
            if (!source) {
                source = new Source(filename, sources[filename]);
                result.sources[filename] = source;
            }

            var code = new Code(name, '0x' + contract.bytecode, contract.interface, source);

            // We don't usually need this, and it gums up the console output, so we
            // wrap it up in a getter function
            Object.defineProperty(code, '_solc', {
                get: function() {
                    return contract;
                }
            });

            code.warnings = warningLookup[filename] || [];

            code.relatedWarnings = [];
            (function() {
                var warnings = {};
                code.warnings.forEach(function(warning) {
                    warnings[warning.uid] = true;
                });
                result.warnings.forEach(function(warning) {
                    if (warnings[warning.uid]) { return; }
                    code.relatedWarnings.push(warning);
                });
            })();

            source.code.push(code);

            result.code.push(code);
        });

        return result;
    }
};

function _compile(filename, optimize, loadSource) {
    var sources = {};
    sources[filename] = loadSource(path.resolve(filename));
    var output = solidity.compile(sources, optimize, loadSource);

    if (output.errors.length) {
        var error = new Error('compiler error');
        error.errors = output.errors;
        error.filename = filename;
        error.optimize = optimize;
        throw error;
    }

    var result = {};
    output.code.forEach(function(code) {

        // Skip all intermediate contracts (inheritance and whatnot)
        if (path.resolve(code.source.filename) !== path.resolve(filename)) {
            return;
        }

        // Two contracts with the same name will be a problem
        if (result[code.name]) {
            var error = new Error('duplicate contract');
            error.name = code.name;
            throw error;
        }

        if (output.warnings) {
            code.globalWarnings = output.warnings;
        }

        result[code.name] = code;
    });

    return result;
}

// Returns the entire function (by looking at balanced braces) of source, starting at offset
function getFunction(source, offset) {
    var start = offset;
    offset += 'function'.length;
    var nameStart = -1;
    var name = null;
    var bodyStart = -1;
    var stack = 0;
    while (true) {
        var c = source[offset++];
        if (c === '{') {
            if (bodyStart === -1) { bodyStart = offset; }
            stack++;
        } else if (c === '}') {
            stack--;
        } else if (name === null) {
            if (nameStart === -1 && c.match(/\S/)) {
                nameStart = offset - 1;
            } else if (nameStart >= 0 && (c === '(' || c.match(/\s/))) {
                name = source.substring(nameStart, offset - 1);
            }
        }

        if (bodyStart >= 0 && stack === 0) {
            return {
                start: start,
                length: offset - start,
                lineNo: countChar(source.substring(0, start), '\n') + 1,
                name: name,
                signature: source.substring(start, bodyStart - 1),
                body: source.substring(bodyStart, offset - 1)
            }
        }
    }
}

function addDebugging(filename, source, addContractInterface) {

    // Check the source is valid before we inject debugging goop
    (function() {
        var output = compile(filename);

        // Errors found! Proceed no further.
        if (output.errors) {
            var error = new Error('compiler error');
            error.errors = output.errors;
            throw error;
        }
    })();

    // Replace all block comments (preserve newlines to protect line numbers)
    source = source.replace(/\/\*(.|\n)*?\*\//g, function(match, p0, offset, all) {
        var result = '';
        var count = countChar(match, '\n');
        for (var i = 0; i < count; i++) { result += '\n'; }
        return '/\*' + result + '*\/';
    });

    // Replace all strings with a place holder to protect them from mutation
    var strings = {};
    (function() {

        var tokenIndex = 0;
        while (true) {
            var token = '___ethers_strings_' + (tokenIndex++);
            if (source.indexOf(token) === -1) { break; }
        }

        var nextId = 0;
        source = source.replace(/("(?:[^\\"]|\\.)*")/g, function(match, p0, offset, all) {
            var placeholder = '_ethers_strings_' + (nextId++);
            strings[placeholder] = p0;
            return placeholder;
        });
    })();

    // Replace //! with debug print lines
    var nextLine = 0;
    source = source.replace(/(\/\/!(.*))\n/g, function(match, p1, p2, offset, all) {
        var lineNo = countChar(all.substring(0, offset), '\n') + 1;
        p2 = p2.trim();
        if (strings[p2]) {
            var param = p2.substring(1) + '_' + (nextLine++);
            return 'string memory ' + param + ' = ' + p2 + '; DebugPrinter(' + DebugPrinter.address +  ').print(' + lineNo + ', ' + param + ');\n';
        } else {
            return 'DebugPrinter(' + DebugPrinter.address +  ').print(' + lineNo + ', ' + p2 + ');\n';
        }
    });

    // Replace inline comments with blank comments
    source = source.replace(/\/\/.*/g, '//');

    // Inject line tracking
    (function() {
        // Pumping Lemma woes... *mumble mumble*
        // There are too many weird cases that can cause this type of injecttion to
        // fail in weird ways. If only braces we required...
        //return;

        // Reverse ordered list of functions (reversed so we don't affect line numbers)
        var funcs = [];
        source.replace(/(function)/g, function(match, p0, offset, all) {
            funcs.unshift(getFunction(all, offset));
        });

        funcs.forEach(function(func) {
            return;
            var body = func.signature + '{';
            body += 'DebugPrinter(' + DebugPrinter.address + ').locate("' + filename + ':' + func.name + '", 0); ';
            /*
            var safe = true;
            func.body.split('\n').forEach(function(line) {
                if (line.trim() === '') {
                    body += '\n';
                    return;
                }

                if (safe) {
                    var lineNo = countChar(source.substring(0, func.start) + body, '\n') + 1;
                    body += 'DebugPrinter(' + DebugPrinter.address + ').locate("' + filename + ':' + func.name + '",' + lineNo + '); ';
                    body += line + '\n';
                } else {
                    body += line + '\n';
                }

                safe = !!(line.match(/[;}{]\s*$/));
            });
            */
            body += '}';

            source = (source.substring(0, func.start) + body + source.substring(func.start + func.length));
        });
    })();

    // Repair strings by replacing the place holders
    Object.keys(strings).forEach(function(placeholder) {
        source = source.replace(placeholder, strings[placeholder]);
    });

    // Add the Debug Printer contract method definitions
    if (addContractInterface) {
        source += '\n\n' + DebugPrinter.contract;
    }

    return source;
}

function compile(filename, optimize) {
    var loadSource = function(filename) {
        return fs.readFileSync(filename).toString();
    }

    return _compile(filename, optimize, loadSource);
}

function testCompile(filename, optimize) {

    // Must include the DebugPrinter exactly once
    var addDebugInterface = true;
    var loadSource = function(filename) {
        var source = addDebugging(filename, fs.readFileSync(filename).toString(), addDebugInterface);
        addDebugInterface = false;
        return source;
    }

    return _compile(filename, optimize, loadSource);
}

module.exports = {
   compile: compile,
   testCompile: testCompile,

   makeCode: function(name, bytecode, contractInterface) {
       return new Code(name, bytecode, contractInterface);
   },

   solidity: solidity
};

