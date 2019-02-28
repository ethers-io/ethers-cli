declare module "solidity-parser-antlr" {
    function parse(source: string): any;
}

declare module "solc" {
    type FindImport = (filename: string) => { contents?: string, error?: string };
    function compile(input: string, findImport?: FindImport): string;
}
