/**
 * Enable command — re-enable a previously disabled domain.
 *
 * Moves the domain's nginx site config from sites-disabled/ back to
 * sites-enabled/, updates the proxybuilder.json config, tests the
 * nginx configuration, and reloads nginx.
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

/** CLI arguments specific to the `enable` command. */
interface IEnableArgs extends ICommonArgs {
    /** Domain name to enable. */
    domain: string;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

/** Yargs command name. */
export const command = "enable";

/** Yargs command description shown in `--help`. */
export const desc = "Enable a disabled domain";

/** Yargs option definitions for the enable command. */
export const builder: CommandBuilder = {
    d: {
        alias: "domain",
        type: "string",
        demandOption: true,
        description: "Domain to enable",
    },
};

/**
 * Handler for the `proxybuilder enable` command.
 *
 * Workflow:
 * 1. Validate domain exists in config
 * 2. Check domain is currently disabled
 * 3. Move config from sites-disabled/ to sites-enabled/
 * 4. Update proxybuilder.json (enabled: true)
 * 5. Test nginx config and reload
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = (argv: IEnableArgs): void => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const shell = new Shell(logger, false);
    const target = path.resolve(argv.target);
    const domain = argv.domain;

    logger.section(`Enabling ${domain}`);
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

    // Check if already enabled — exit gracefully, not an error.
    if (domainConfig.enabled) {
        logger.info(`Domain ${domain} is already enabled`);
        return;
    }

    // --- Move config to sites-enabled ---
    builder.moveDomainConfig(domain, true);
    logger.blank();

    // --- Update config ---
    configManager.updateDomain(domain, { enabled: true });

    // --- Test and reload nginx ---
    const configOk = builder.testNginxConfig();
    if (configOk) {
        builder.reloadNginx();
    } else {
        logger.warn("nginx config test failed — skipping reload");
    }
    logger.blank();

    logger.success(`Domain ${domain} enabled`);
};
