/**
 * Renew command — renew SSL certificates for one or all domains.
 *
 * Uses the appropriate challenge method (webroot or DNS-01) based on
 * each domain's stored configuration. Called daily by the cron job
 * for automatic renewal. Certbot's `--keep-until-expiring` flag ensures
 * certificates are only renewed when within 30 days of expiry.
 *
 * @packageDocumentation
 */

import path from "path";
import { CommandBuilder } from "yargs";

import { ICommonArgs, IDomainConfig, LogLevel } from "../types";
import { CERTBOT_BIN, FOLDERS } from "../constants";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { Validator } from "../validator";
import { ProxyBuilder } from "../builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `renew` command. */
interface IRenewArgs extends ICommonArgs {
    /** Specific domain to renew (omit for all). */
    domain?: string;
    /** Use Let's Encrypt staging environment. */
    staging: boolean;
    /** Force renewal even if not expiring. */
    force: boolean;
    /** Check what would be renewed without executing. */
    "dry-run": boolean;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

export const command = "renew";
export const desc = "Renew SSL certificates";

export const builder: CommandBuilder = {
    d: {
        alias: "domain",
        type: "string",
        description: "Specific domain to renew (omit for all)",
    },
    x: {
        alias: "staging",
        type: "boolean",
        default: false,
        description: "Use Let's Encrypt staging environment",
    },
    f: {
        alias: "force",
        type: "boolean",
        default: false,
        description: "Force renewal even if not expiring",
    },
    "dry-run": {
        type: "boolean",
        default: false,
        description: "Check what would be renewed",
    },
};

/**
 * Handler for the `proxybuilder renew` command.
 *
 * Renews certificates for one or all enabled domains, then reloads nginx.
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = (argv: IRenewArgs): void => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const dryRun = argv["dry-run"];
    const shell = new Shell(logger, dryRun);
    const target = path.resolve(argv.target);

    logger.section("Certificate Renewal");
    logger.blank();

    // --- Load config ---
    const proxyBuilder = new ProxyBuilder(target, logger, shell);
    const config = proxyBuilder.loadConfig();

    if (!config) {
        logger.error("Not initialized. Run 'proxybuilder init' first.");
        process.exit(1);
    }

    const configManager = proxyBuilder.getConfigManager();

    // --- Determine domains to renew ---
    let domainsToRenew: Array<{ domain: string; config: IDomainConfig }>;

    if (argv.domain) {
        if (!Validator.isValidDomain(argv.domain)) {
            logger.error(`Invalid domain name: "${argv.domain}"`);
            process.exit(1);
        }
        const dc = configManager.getDomain(argv.domain);
        if (!dc) {
            logger.error(`Domain "${argv.domain}" not configured.`);
            process.exit(1);
        }
        domainsToRenew = [{ domain: argv.domain, config: dc }];
    } else {
        // Renew all enabled domains.
        domainsToRenew = configManager.listDomains().filter(({ config: dc }) => dc.enabled);
    }

    if (domainsToRenew.length === 0) {
        logger.info("No domains to renew.");
        return;
    }

    logger.info(`Renewing ${domainsToRenew.length} domain(s)...`);
    logger.blank();

    // --- Renew each domain ---
    let successCount = 0;
    let failCount = 0;

    for (const { domain, config: dc } of domainsToRenew) {
        logger.section(`Renewing ${domain}`);

        // Use staging flag from either CLI or domain config.
        const staging = argv.staging || dc.staging;

        const configDir = path.join(target, FOLDERS.letsencrypt);
        const workDir = path.join(target, FOLDERS.letsencrypt, "lib");
        const logsDir = path.join(target, FOLDERS.logs);

        const flags = [
            `--config-dir ${configDir}`,
            `--work-dir ${workDir}`,
            `--logs-dir ${logsDir}`,
            `--email ${config.email}`,
            "--agree-tos",
            "--non-interactive",
            `-d ${domain}`,
        ];

        // Only skip renewal of non-expiring certs when not forcing.
        if (!argv.force) {
            flags.push("--keep-until-expiring");
        }

        if (staging) {
            flags.push("--test-cert");
        }

        if (dc.certMethod === "webroot") {
            const webroot = path.join(target, FOLDERS.letsencrypt);
            flags.push(`--webroot -w ${webroot}`);
        } else {
            // DNS-01 challenge with manual hooks.
            const hookDir = path.join(target, FOLDERS.dns);
            const provider = dc.dnsProvider ?? "cloudns";
            flags.push(
                "--manual",
                "--preferred-challenges dns",
                `--manual-auth-hook ${path.join(hookDir, `${provider}-auth.sh`)}`,
                `--manual-cleanup-hook ${path.join(hookDir, `${provider}-cleanup.sh`)}`,
            );
        }

        const result = shell.exec(`${CERTBOT_BIN} certonly ${flags.join(" ")}`, { fatal: false });

        if (result.success) {
            logger.success(`Certificate renewed for ${domain}`);
            successCount++;
        } else {
            logger.error(`Failed to renew certificate for ${domain}`);
            failCount++;
        }
        logger.blank();
    }

    // --- Reload nginx once after all renewals ---
    if (successCount > 0 && !dryRun) {
        proxyBuilder.reloadNginx();
    }

    // --- Summary ---
    logger.blank();
    logger.section("Renewal Summary");
    logger.info(`Renewed: ${successCount}, Failed: ${failCount}`);
};
