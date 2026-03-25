/**
 * Disable command — temporarily disable a domain without deleting it.
 *
 * Moves the domain's nginx site config from sites-enabled/ to
 * sites-disabled/, updates the proxybuilder.json config, tests the
 * nginx configuration, and reloads nginx. The domain's SSL certificate
 * and app folder are preserved for future re-enabling.
 *
 * @packageDocumentation
 */

import path from "path";
import { CommandBuilder } from "yargs";

import { ICommonArgs, LogLevel } from "../types";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { Validator } from "../validator";
import { ProxyBuilder } from "../builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `disable` command. */
interface IDisableArgs extends ICommonArgs {
    /** Domain name to disable. */
    domain: string;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

/** Yargs command name. */
export const command = "disable";

/** Yargs command description shown in `--help`. */
export const desc = "Disable a domain (preserves config and certificate)";

/** Yargs option definitions for the disable command. */
export const builder: CommandBuilder = {
    d: {
        alias: "domain",
        type: "string",
        demandOption: true,
        description: "Domain to disable",
    },
};

/**
 * Handler for the `proxybuilder disable` command.
 *
 * Workflow:
 * 1. Validate domain exists in config
 * 2. Check domain is currently enabled
 * 3. Move config from sites-enabled/ to sites-disabled/
 * 4. Update proxybuilder.json (enabled: false)
 * 5. Test nginx config and reload
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = (argv: IDisableArgs): void => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const shell = new Shell(logger, false);
    const target = path.resolve(argv.target);
    const domain = argv.domain;

    logger.section(`Disabling ${domain}`);
    logger.blank();

    // --- Validate domain ---
    if (!Validator.isValidDomain(domain)) {
        logger.error(`Invalid domain name: "${domain}"`);
        process.exit(1);
    }

    // --- Load config ---
    const builder = new ProxyBuilder(target, logger, shell);
    const config = builder.loadConfig();

    if (!config) {
        logger.error("Not initialized. Run 'proxybuilder init' first.");
        process.exit(1);
    }

    const configManager = builder.getConfigManager();
    const domainConfig = configManager.getDomain(domain);

    if (!domainConfig) {
        logger.error(`Domain "${domain}" not configured. Run 'proxybuilder list' to see domains.`);
        process.exit(1);
    }

    // Check if already disabled — exit gracefully, not an error.
    if (!domainConfig.enabled) {
        logger.info(`Domain ${domain} is already disabled`);
        return;
    }

    // --- Move config to sites-disabled ---
    builder.moveDomainConfig(domain, false);
    logger.blank();

    // --- Update config ---
    configManager.updateDomain(domain, { enabled: false });

    // --- Test and reload nginx ---
    const configOk = builder.testNginxConfig();
    if (configOk) {
        builder.reloadNginx();
    } else {
        logger.warn("nginx config test failed — skipping reload");
    }
    logger.blank();

    logger.success(`Domain ${domain} disabled`);
};
