/**
 * Update command — modify the configuration of an existing domain.
 *
 * Re-renders nginx templates with updated upstream addresses and/or
 * proxy mode, tests the configuration, and reloads nginx. Changes
 * are persisted to proxybuilder.json.
 *
 * @packageDocumentation
 */

import path from "path";
import { CommandBuilder } from "yargs";

import { ICommonArgs, LogLevel, ProxyMode } from "../types";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { Validator } from "../validator";
import { ProxyBuilder } from "../builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `update` command. */
interface IUpdateArgs extends ICommonArgs {
    /** Domain name to update. */
    domain: string;
    /** New upstream address(es) — replaces all existing upstreams. */
    upstream?: string[];
    /** New proxy mode. */
    mode?: ProxyMode;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

/** Yargs command name. */
export const command = "update";

/** Yargs command description shown in `--help`. */
export const desc = "Update domain configuration (upstreams, mode)";

/** Yargs option definitions for the update command. */
export const builder: CommandBuilder = {
    d: {
        alias: "domain",
        type: "string",
        demandOption: true,
        description: "Domain to update",
    },
    u: {
        alias: "upstream",
        type: "array",
        description: "New upstream address(es) — replaces all existing",
    },
    m: {
        alias: "mode",
        type: "string",
        choices: ["passthrough", "full"],
        description: "New proxy mode",
    },
};

/**
 * Handler for the `proxybuilder update` command.
 *
 * Workflow:
 * 1. Validate domain exists in config
 * 2. Validate new values (upstream format, mode)
 * 3. Merge changes into existing config
 * 4. Re-render all domain templates
 * 5. Test nginx config and reload
 * 6. Save updated proxybuilder.json
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = (argv: IUpdateArgs): void => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const shell = new Shell(logger, false);
    const target = path.resolve(argv.target);
    const domain = argv.domain;

    logger.section(`Updating ${domain}`);
    logger.blank();

    // --- Validate domain ---
    if (!Validator.isValidDomain(domain)) {
        logger.error(`Invalid domain name: "${domain}"`);
        process.exit(1);
    }

    // --- Load config ---
    const proxyBuilder = new ProxyBuilder(target, logger, shell);
    const config = proxyBuilder.loadConfig();

    if (!config) {
        logger.error("Not initialized. Run 'proxybuilder init' first.");
        process.exit(1);
    }

    const configManager = proxyBuilder.getConfigManager();
    const domainConfig = configManager.getDomain(domain);

    if (!domainConfig) {
        logger.error(`Domain "${domain}" not configured. Run 'proxybuilder list' to see domains.`);
        process.exit(1);
    }

    // --- Check that at least one change was requested ---
    if (!argv.upstream && !argv.mode) {
        logger.error("Nothing to update. Specify --upstream and/or --mode.");
        process.exit(1);
    }

    // --- Validate and apply changes ---
    let upstreams = domainConfig.upstreams;
    let mode = domainConfig.proxyMode;
    const changes: string[] = [];

    // Validate and apply new upstreams if provided.
    if (argv.upstream) {
        const newUpstreams = argv.upstream.map(String);
        for (const upstream of newUpstreams) {
            if (!Validator.isValidUpstream(upstream)) {
                logger.error(`Invalid upstream address: "${upstream}" (expected host:port)`);
                process.exit(1);
            }
        }
        changes.push(`Upstreams: ${domainConfig.upstreams.join(", ")} → ${newUpstreams.join(", ")}`);
        upstreams = newUpstreams;
    }

    // Validate and apply new mode if provided.
    if (argv.mode) {
        if (!Validator.isValidProxyMode(argv.mode)) {
            logger.error(`Invalid proxy mode: "${argv.mode}" (expected "passthrough" or "full")`);
            process.exit(1);
        }
        if (argv.mode !== domainConfig.proxyMode) {
            changes.push(`Mode: ${domainConfig.proxyMode} → ${argv.mode}`);
            mode = argv.mode;
        } else {
            changes.push(`Mode: ${domainConfig.proxyMode} (unchanged)`);
        }
    }

    // Log what's changing.
    logger.info("Changes:");
    for (const change of changes) {
        logger.info(`  ${change}`);
    }
    logger.blank();

    // --- Re-render domain templates ---
    logger.info("Re-rendering templates...");
    proxyBuilder.renderDomainConfigs(domain, mode, upstreams, domainConfig.wildcard);
    logger.blank();

    // --- Test and reload nginx ---
    const configOk = proxyBuilder.testNginxConfig();
    if (configOk) {
        proxyBuilder.reloadNginx();
    } else {
        logger.warn("nginx config test failed — skipping reload");
    }
    logger.blank();

    // --- Save updated config ---
    configManager.updateDomain(domain, {
        upstreams,
        proxyMode: mode,
    });

    logger.success(`Domain ${domain} updated`);
};
