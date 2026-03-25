/**
 * List command — display all configured domains in a table or JSON.
 *
 * Shows domain name, status (enabled/disabled), proxy mode, upstream
 * addresses, certificate expiry date, maintenance mode status, and
 * whether staging certificates are in use.
 *
 * @packageDocumentation
 */

import path from "path";
import { CommandBuilder } from "yargs";

import { ICommonArgs, LogLevel } from "../types";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { ProxyBuilder } from "../builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `list` command. */
interface IListArgs extends ICommonArgs {
    /** Output as JSON instead of table. */
    json: boolean;
}

/** JSON output structure for a single domain entry. */
interface IDomainJsonEntry {
    domain: string;
    status: string;
    mode: string;
    upstreams: string[];
    certExpiry: string;
    maintenance: boolean;
    staging: boolean;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

/** Yargs command name. */
export const command = "list";

/** Yargs command description shown in `--help`. */
export const desc = "List all configured domains";

/** Yargs option definitions for the list command. */
export const builder: CommandBuilder = {
    json: {
        type: "boolean",
        default: false,
        description: "Output as JSON instead of table",
    },
};

/**
 * Handler for the `proxybuilder list` command.
 *
 * Loads the config, iterates all domains, fetches certificate expiry
 * dates, and outputs either a formatted table or JSON array.
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = (argv: IListArgs): void => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const shell = new Shell(logger, false);
    const target = path.resolve(argv.target);

    // --- Load config ---
    const proxyBuilder = new ProxyBuilder(target, logger, shell);
    const config = proxyBuilder.loadConfig();

    if (!config) {
        logger.error("Not initialized. Run 'proxybuilder init' first.");
        process.exit(1);
    }

    const configManager = proxyBuilder.getConfigManager();
    const domains = configManager.listDomains();

    if (domains.length === 0) {
        logger.info("No domains configured. Use 'proxybuilder create' to add one.");
        return;
    }

    // --- JSON output ---
    if (argv.json) {
        const jsonOutput: { domains: IDomainJsonEntry[] } = {
            domains: domains.map(({ domain, config: dc }) => ({
                domain,
                status: dc.enabled ? "enabled" : "disabled",
                mode: dc.proxyMode,
                upstreams: dc.upstreams,
                certExpiry: proxyBuilder.getCertExpiry(domain),
                maintenance: dc.maintenance,
                staging: dc.staging,
            })),
        };
        // Write JSON to stdout directly for piping/parsing.
        console.log(JSON.stringify(jsonOutput, null, 2));
        return;
    }

    // --- Table output ---
    // Column widths calculated for readability.
    const widths = [22, 10, 14, 30, 14, 7, 8];
    const headers = ["DOMAIN", "STATUS", "MODE", "UPSTREAMS", "CERT EXPIRES", "MAINT", "STAGING"];

    logger.blank();
    logger.tableRow(headers, widths);

    // Print a separator line under the headers.
    const separator = widths.map((w) => "─".repeat(w)).join("  ");
    console.log(separator);

    for (const { domain, config: dc } of domains) {
        const certExpiry = proxyBuilder.getCertExpiry(domain);
        const upstreamStr = formatUpstreams(dc.upstreams);

        logger.tableRow(
            [
                domain,
                dc.enabled ? "enabled" : "disabled",
                dc.proxyMode,
                upstreamStr,
                certExpiry,
                dc.maintenance ? "on" : "off",
                dc.staging ? "yes" : "no",
            ],
            widths,
        );
    }

    logger.blank();
    logger.info(`Total: ${domains.length} domain(s)`);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format upstream addresses for table display.
 *
 * If all upstreams share the same host, abbreviates to show the host
 * once with comma-separated ports (e.g. "127.0.0.1:3000,3001").
 * Otherwise shows full addresses comma-separated.
 *
 * @param upstreams - Array of host:port strings.
 * @returns Formatted string for display.
 */
function formatUpstreams(upstreams: string[]): string {
    if (upstreams.length <= 1) {
        return upstreams[0] ?? "";
    }

    // Check if all upstreams share the same host.
    const hosts = upstreams.map((u) => u.split(":")[0]);
    const allSameHost = hosts.every((h) => h === hosts[0]);

    if (allSameHost) {
        // Abbreviate: "127.0.0.1:3000,3001"
        const host = hosts[0];
        const ports = upstreams.map((u) => u.split(":")[1]);
        return `${host}:${ports.join(",")}`;
    }

    return upstreams.join(", ");
}
