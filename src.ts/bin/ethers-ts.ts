#!/usr/bin/env node

'use strict';

import fs from 'fs';
import { join as pathJoin } from "path";

import { ethers } from 'ethers';

import { Opts, Plugin, run } from '../lib/cli';
import { header as Header, generate as generateTypeScript } from "../lib/typescript";
import { compile, ContractCode } from "../lib/solc";

function computeHash(content: string): string {
    let bareContent = content.replace(/\/\*\* Content Hash: 0x[0-9A-F]{64} \*\//i, '/** Content Hash: */');
    return ethers.utils.id(bareContent);
}

function checkHash(content: string): boolean {
    let match = content.match(/\/\*\* Content Hash: (0x[0-9A-F]{64}) \*\//i);
    return (match && match[1] === computeHash(content));
}

function addContentHash(content: string): string {
    let contentHash = computeHash("/** Content Hash: */\n" + content);
    return "/** Content Hash: " + contentHash + " */\n" + content;
}

function save(path: string, content: string, force?: boolean): boolean {
    if (fs.existsSync(path) && !force) {
        let oldContent = fs.readFileSync(path).toString();
        if (!checkHash(oldContent)) { return false; }
    }
    fs.writeFileSync(path, content);
    return true;
}

function walkFilenames(filenames: Array<string>): Array<string> {
    let result: Array<string> = [];
    filenames.forEach((filename) => {
        let stat = fs.statSync(filename);
        if (stat.isDirectory()) {
            walkFilenames(fs.readdirSync(filename).map((x: string) => pathJoin(filename, x))).forEach((filename) => {
                result.push(filename);
            });
        } else if (stat.isFile()) {
            result.push(filename);
        }
    });
    return result;
}

let options: any = {
    _name: 'ethers-ts'
};

let plugins: { [ command: string ]: Plugin } = { };

class GeneratePlugin extends Plugin {
    help = "FILENAME [ FILENAME ... ]";
    options = {
        force: "Force overwriting modified files (not recommended)",
        unoptimized: "Do not run the optimizer",
        output: "Target filename or folder to save .ts to"
    };

    private filenames: Array<string>;
    private output: string;
    private force: boolean;
    private optimize: boolean;

    prepare(opts: Opts): Promise<void> {
        if (opts.args.length < 2) {
            throw new Error('generate requires at least one FILENAME');
        }

        this.filenames = opts.args.slice(1);
        this.output = opts.options.output || null;
        this.force = opts.options.force;
        this.optimize = !opts.options.unoptimized;

        return Promise.resolve(null);
    }

    async run(): Promise<void> {
        let output = Header;

        walkFilenames(this.filenames).forEach((filename) => {
            if (!filename.match(/\.sol$/)) { return; }
            let contracts: Array<ContractCode> = null;
            let content = fs.readFileSync(filename).toString();

            try {
                 contracts = compile(content, { filename: filename, optimize: this.optimize });
            } catch (error) {
                console.log(error);
                if ((<any>error).errors) {
                    (<any>error).errors.forEach((error: string) => {
                        console.log(error);
                    });
                }

                throw new Error("errors during compilation");
            }

            contracts.forEach((contract) => {
                output += generateTypeScript(contract, contract.bytecode);
                output += "\n";
            });
        });

        output = addContentHash(output.trim());

        if (this.output) {
            let success = save(this.output, output, this.force);
            if (!success) {
                return Promise.reject(new Error("File has been modified; use --force"));
            }
        } else {
            console.log(output);
        }

        return Promise.resolve(null);
    }
}
plugins['generate'] = new GeneratePlugin();
options.force = false;
options.unopimized = false;
options.output = "";

run(options, plugins);
