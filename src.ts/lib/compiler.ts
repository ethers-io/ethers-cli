'use strict';

import fs from 'fs';
import path from 'path';
import util from 'util';

import { ethers } from 'ethers';

let solc: { compile: (...args: Array<any>) => any } = null;

import { DebugPrinter } from './debug-printer';

function countChar(text: string, character: string) {
    return text.split(character).length - 1;
}

function CompileWarning() { }
function CompileError() { }

function populate(kind: any, params: { message: string, code?: string }) {
    var message = params.message;
    //var code = null;
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

class ParsedError {
    readonly filename: string;

    readonly row: number;
    readonly column: number;

    readonly message: string;
    readonly uid: string;
    readonly type: string;

    constructor(filename: string, row: number, column: number, type: string, message: string, uid: string) {
        this.filename = filename;
        this.row = row;
        this.column = column;
        this.type = type;
        this.message = message;
        this.uid = uid;
    }
}

function parseError(text: string): ParsedError {
    var uid = ethers.utils.id(text);
    var match = text.match(/^([^:]*):([0-9]+):([0-9]+): Warning: ((.|\n)*)$/);
    if (match) {
        return new ParsedError(match[1], parseInt(match[2]), parseInt(match[3]), 'Warning', match[4], uid);
    }

    var match = text.match(/^([^:]*):([0-9]+):([0-9]+): (\S*Error): ((.|\n)*)$/);
    if (match) {
        return new ParsedError(match[1], parseInt(match[2]), parseInt(match[3]), match[4], match[5], uid);
    }

    return populate(CompileError, { message: text, uid: uid });
}


class Source {
    readonly filename: string;
    readonly source: string;
    readonly code: Array<Code>;
    constructor(filename, source) {
        this.filename = filename;
        this.source = source;
        this.code = [];
    }

    inspect(depth: number, opts: any) {
        return "[source]";
    }
}

class Code {
    readonly name: string;
    readonly bytecode: string;
    readonly jsonInterface: string;
    readonly interface: ethers.Interface;
    readonly source: Source;
    readonly warnings: Array<ParsedError>;
    readonly relatedWarnings: Array<ParsedError>;

    constructor(name: string, bytecode: string, contractInterface: string, source?: Source) {
        ethers.errors.checkNew(this, Code);

        this.name = name;
        this.bytecode = bytecode;
        this.jsonInterface = contractInterface;
        this.interface = new ethers.Interface(contractInterface);

        this.source = source || (new Source(null, null));
        this.source.code.push(this);

        this.warnings = [];
        this.relatedWarnings = [];
    }

    inspect(depth: number, opts: any) {
        if (depth === 0) { return "[Code " + this.name + "]"; }

        let code = {
            name: this.name,
            bytecode: this.bytecode,
            jsonInterface: this.jsonInterface,
            interface: this.interface,
            source: this.source,
        };

        if (depth === 1) {
            if (code.bytecode.length > 32) {
                code.bytecode = code.bytecode.substring(0, 28) + ' ...';
            }
            if (code.jsonInterface.length > 32) {
                code.jsonInterface = code.jsonInterface.substring(0, 28) + ' ...';
            }
        }

        return code;
    }

    connect(address: string, providerOrSigner: ethers.types.Signer | ethers.providers.Provider): ethers.Contract {
        return new ethers.Contract(address, this.interface, providerOrSigner)
    }

    getDeployTransaction(...args: Array<any>) {
        var params = [ this.bytecode, this.interface ];
        return {
            data: this.interface.deployFunction.encode(this.bytecode, params)
        }
    }
}

type CompiledResult = {
    errors: Array<ParsedError>;
    warnings: Array<ParsedError>;
    relatedWarnings?: Array<ParsedError>;
    sources?: { [filename: string]: Source };
    code?: Array<string>;
};

type _Contract = {
    bytecode: string;
    interface: string;
}

type _CompiledCode = {
    contracts: { [filename: string]: _Contract };
    errors: Array<string>;
};

var solidity = {

    // Expose the raw compiler, in case that's what the user really wants
    _compile: function(...args: Array<any>): _CompiledCode {
        if (!solc) {
            solc = require('solc');
        }
        return solc.compile.apply(solc, args);
    },

    // Experimental; this will change
    compile: function(sources: { [filename: string]: string }, optimize: boolean, loadSource: (filename: string) => string) {
        function loadImport(filename: string): { contents?: string, error?: string } {
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

        let result: CompiledResult = {
            errors: [],
            warnings: []
        };

        var warningLookup: { [filename: string]: Array<ParsedError> } = {}
        if (output.errors) {
            output.errors.forEach(function(error) {
                let parsedError = parseError(error);
                if (parsedError instanceof CompileWarning) {
                    result.warnings.push(parsedError);
                    if (!warningLookup[parsedError.filename]) { warningLookup[parsedError.filename] = []; }
                    warningLookup[parsedError.filename].push(parsedError);
                } else {
                    result.errors.push(parsedError);
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

            let code = new Code(name, '0x' + contract.bytecode, contract.interface, source);

            // We don't usually need this, and it gums up the console output, so we
            // wrap it up in a getter function
            Object.defineProperty(code, '_solc', {
                get: function() {
                    return contract;
                }
            });

            (warningLookup[filename] || []).forEach((warning: ParsedError) => {
                code.warnings.push(warning);
            });

            (function() {
                var warnings: { [uid: string]: boolean } = {};
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

function _compile(filename: string, optimize: boolean, loadSource: (filename: string) => string) {
    var sources = {};
    sources[filename] = loadSource(path.resolve(filename));
    var output = solidity.compile(sources, optimize, loadSource);

    if (output.errors.length) {
        var error = new Error('compiler error');
        (<any>error).errors = output.errors;
        (<any>error).filename = filename;
        (<any>error).optimize = optimize;
        throw error;
    }

    var result: { [filename: string]: any } = { };
    output.code.forEach(function(code: any) {

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

type FunctionDefinition = {
     start: number;
     length: number;
     lineNo: number;
     name: string;
     signature: string;
     body: string;
};

// Returns the entire function (by looking at balanced braces) of source, starting at offset
function getFunction(source: string, offset: number): FunctionDefinition {
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

function addDebugging(filename: string, source: string, addContractInterface: boolean): string {

    // Check the source is valid before we inject debugging goop
    (function() {
        let output = compile(filename);

        // Errors found! Proceed no further.
        if (output.errors) {
            let error = new Error('compiler error');
            (<any>error).errors = output.errors;
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
    var strings: { [ placeHolder: string]: string  } = {};
    (function() {

        var tokenIndex = 0;
        while (true) {
            var token = '___ethers_strings_' + (tokenIndex++);
            if (source.indexOf(token) === -1) { break; }
        }

        var nextId = 0;
        source = source.replace(/("(?:[^\\"]|\\.)*")/g, function(match: string, p0: string, offset: number, all: string) {
            var placeholder = '_ethers_strings_' + (nextId++);
            strings[placeholder] = p0;
            return placeholder;
        });
    })();

    // Replace //! with debug print lines
    var nextLine = 0;
    source = source.replace(/(\/\/!(.*))\n/g, function(match: string, p1: string, p2: string, offset: number, all: string) {
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
        var funcs: Array<FunctionDefinition> = [];
        source.replace(/(function)/g, function(match: string, p0: string, offset: number, all: string): string {
            funcs.unshift(getFunction(all, offset));
            return null;
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

function compile(filename: string, optimize?: boolean) {
    var loadSource = function(filename: string) {
        return fs.readFileSync(filename).toString();
    }

    return _compile(filename, optimize, loadSource);
}

function testCompile(filename: string, optimize: boolean) {

    // Must include the DebugPrinter exactly once
    var addDebugInterface = true;
    var loadSource = function(filename: string) {
        var source = addDebugging(filename, fs.readFileSync(filename).toString(), addDebugInterface);
        addDebugInterface = false;
        return source;
    }

    return _compile(filename, optimize, loadSource);
}

module.exports = {
   compile: compile,
   testCompile: testCompile,

   makeCode: function(name: string, bytecode: string, contractInterface: string) {
       return new Code(name, bytecode, contractInterface);
   },

   solidity: solidity
};

