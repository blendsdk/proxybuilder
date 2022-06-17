#!/usr/bin/env node
import * as path from "path";
import yargs from "yargs";

// tslint:disable-next-line: no-unused-expression
yargs
    .scriptName("proxybuilder")
    .commandDir(path.resolve(path.join(__dirname, "commands")))
    .demandCommand()
    .help().argv;
