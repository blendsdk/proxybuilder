#!/usr/bin/env node

/**
 * Proxybuilder CLI — Nginx reverse proxy configuration builder.
 *
 * Entry point for the `proxybuilder` CLI tool. Uses yargs with commandDir
 * to auto-discover command handlers from the `commands/` directory.
 *
 * @packageDocumentation
 */

import path from "path";
import yargs from "yargs";

yargs
    .scriptName("proxybuilder")
    .commandDir(path.resolve(path.join(__dirname, "commands")))
    .demandCommand(1, "You must specify a command. Run --help for available commands.")
    .strict()
    .option("t", {
        alias: "target",
        type: "string",
        default: "/opt/proxybuilder",
        description: "Target folder for proxybuilder data",
        global: true,
    })
    .option("verbose", {
        type: "boolean",
        default: false,
        description: "Enable verbose (debug) output",
        global: true,
    })
    .option("quiet", {
        type: "boolean",
        default: false,
        description: "Suppress all output except errors",
        global: true,
    })
    .version()
    .help()
    .alias("h", "help")
    .epilogue("For more information, see: https://github.com/blendsdk/proxybuilder")
    .parse();
