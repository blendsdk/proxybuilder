/**
 * Maintenance command — toggle maintenance mode for a domain.
 *
 * Uses a file-based flag that nginx checks per-request, so no nginx
 * reload is needed. When the flag file exists, nginx returns a 503
 * with the domain's maintenance.html page.
 *
 * @packageDocumentation
 */

import fs from "fs";
import path from "path";
import { CommandBuilder } from "yargs";

import { ICommonArgs, LogLevel } from "../types";
import { FOLDERS, MAINTENANCE_FLAG } from "../constants";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { Validator } from "../validator";
import { ProxyBuilder } from "../builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `maintenance` command. */
interface IMaintenanceArgs extends ICommonArgs {
    domain: string;
    on: boolean;
    off: boolean;
    status: boolean;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

export const command = "maintenance";
export const desc = "Toggle maintenance mode for a domain";

export const builder: CommandBuilder = {
    d: {
        alias: "domain",
        type: "string",
        demandOption: true,
        description: "Domain to toggle",
    },
    on: {
        type: "boolean",
        default: false,
        description: "Enable maintenance mode",
    },
    off: {
        type: "boolean",
        default: false,
        description: "Disable maintenance mode",
    },
    s: {
        alias: "status",
        type: "boolean",
        default: false,
        description: "Check current maintenance state",
    },
};

/**
 * Handler for the `proxybuilder maintenance` command.
 *
 * Creates or removes the maintenance flag file. No nginx reload needed.
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = (argv: IMaintenanceArgs): void => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const shell = new Shell(logger, false);
    const target = path.resolve(argv.target);
    const domain = argv.domain;

    // Validate exactly one action is specified.
    const actions = [argv.on, argv.off, argv.status].filter(Boolean).length;
    if (actions === 0) {
        logger.error("Specify --on, --off, or --status");
        process.exit(1);
    }
    if (actions > 1) {
        logger.error("Specify only one of --on, --off, or --status");
        process.exit(1);
    }

    if (!Validator.isValidDomain(domain)) {
        logger.error(`Invalid domain name: "${domain}"`);
        process.exit(1);
    }

    // Load config.
    const proxyBuilder = new ProxyBuilder(target, logger, shell);
    const config = proxyBuilder.loadConfig();

    if (!config) {
        logger.error("Not initialized. Run 'proxybuilder init' first.");
        process.exit(1);
    }

    const configManager = proxyBuilder.getConfigManager();
    const domainConfig = configManager.getDomain(domain);

    if (!domainConfig) {
        logger.error(`Domain "${domain}" not configured.`);
        process.exit(1);
    }

    const flagPath = path.join(target, FOLDERS.apps, domain, MAINTENANCE_FLAG);

    // --- Status check ---
    if (argv.status) {
        const isOn = fs.existsSync(flagPath);
        logger.info(`Maintenance mode is ${isOn ? "ON" : "OFF"} for ${domain}`);
        return;
    }

    // --- Enable maintenance ---
    if (argv.on) {
        fs.writeFileSync(flagPath, `Maintenance enabled at ${new Date().toISOString()}\n`);
        configManager.updateDomain(domain, { maintenance: true });

        logger.success(`Maintenance mode ON for ${domain}`);
        logger.info("Requests will receive 503 with maintenance page");
        logger.info(`Custom page: ${path.join(target, FOLDERS.apps, domain, "maintenance.html")}`);
        return;
    }

    // --- Disable maintenance ---
    if (argv.off) {
        if (fs.existsSync(flagPath)) {
            fs.unlinkSync(flagPath);
        }
        configManager.updateDomain(domain, { maintenance: false });

        logger.success(`Maintenance mode OFF for ${domain}`);
        logger.info("Domain is now serving traffic normally");
    }
};
