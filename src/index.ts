#!/usr/bin/env node

/**
 * Proxybuilder CLI — Nginx reverse proxy configuration builder.
 *
 * Entry point for the `proxybuilder` CLI tool. Uses yargs with commandDir
 * to auto-discover command handlers from the `commands/` directory.
 *
 * @packageDocumentation
 */

import fs from "fs";
import path from "path";
import yargs from "yargs";

// Read the version from package.json at runtime so the CLI banner
// always reflects the installed package version.
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"));

yargs
    .scriptName("proxybuilder")
    .usage(`proxybuilder v${pkg.version}\n\nUsage: $0 <command>`)
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
