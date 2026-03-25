/**
 * Delete command — fully remove a domain from the reverse proxy.
 *
 * Revokes the SSL certificate (unless --keep-cert), removes all nginx
 * config files and the domain's app folder, reloads nginx, and removes
 * the domain from proxybuilder.json.
 *
 * Requires --force to skip the confirmation prompt when running
 * non-interactively (e.g. in CI/CD pipelines).
 *
 * @packageDocumentation
 */

import path from "path";
import readline from "readline";
import { CommandBuilder } from "yargs";

import { ICommonArgs, LogLevel } from "../types";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { Validator } from "../validator";
import { ProxyBuilder } from "../builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `delete` command. */
interface IDeleteArgs extends ICommonArgs {
    /** Domain name to delete. */
    domain: string;
    /** Skip the confirmation prompt. */
    force: boolean;
    /** Don't revoke the SSL certificate. */
    "keep-cert": boolean;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

/** Yargs command name. */
export const command = "delete";

/** Yargs command description shown in `--help`. */
export const desc = "Delete a domain and its configuration";

/** Yargs option definitions for the delete command. */
export const builder: CommandBuilder = {
    d: {
        alias: "domain",
        type: "string",
        demandOption: true,
        description: "Domain to delete",
    },
    f: {
        alias: "force",
        type: "boolean",
        default: false,
        description: "Skip confirmation prompt",
    },
    "keep-cert": {
        type: "boolean",
        default: false,
        description: "Don't revoke the SSL certificate",
    },
};

/**
 * Prompt the user for confirmation before destructive delete.
 *
 * Returns a promise that resolves to true if the user confirms (y/yes),
 * or false for any other input. Uses readline for stdin interaction.
 *
 * @param domain  - Domain name for the confirmation message.
 * @param appPath - App folder path shown in the warning.
 * @returns true if the user confirmed deletion.
 */
function confirmDeletion(domain: string, appPath: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        console.log("");
        console.log("⚠️  This will permanently delete:");
        console.log(`  - SSL certificate for ${domain}`);
        console.log("  - Nginx configuration");
        console.log(`  - App folder (${appPath})`);
        console.log("");

        rl.question("  Continue? [y/N]: ", (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
        });
    });
}

/**
 * Handler for the `proxybuilder delete` command.
 *
 * Orchestrates domain deletion:
 * 1. Validate domain exists in config
 * 2. Prompt for confirmation (unless --force)
 * 3. Revoke SSL certificate (unless --keep-cert)
 * 4. Remove all domain files (configs, app folder)
 * 5. Test and reload nginx
 * 6. Remove domain from proxybuilder.json
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = async (argv: IDeleteArgs): Promise<void> => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const shell = new Shell(logger, false);
    const target = path.resolve(argv.target);
    const domain = argv.domain;

    logger.section(`Deleting ${domain}`);
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

    // --- Confirmation prompt ---
    if (!argv.force) {
        const appPath = proxyBuilder.resolvePath("apps", domain);
        const confirmed = await confirmDeletion(domain, appPath);
        if (!confirmed) {
            logger.info("Deletion cancelled");
            return;
        }
    }

    // --- Revoke certificate ---
    if (!argv["keep-cert"]) {
        proxyBuilder.revokeCertificate(domain, domainConfig.staging);
    } else {
        logger.info("Skipping certificate revocation (--keep-cert)");
    }
    logger.blank();

    // --- Remove domain files ---
    proxyBuilder.deleteDomainFiles(domain);
    logger.blank();

    // --- Test and reload nginx ---
    const configOk = proxyBuilder.testNginxConfig();
    if (configOk) {
        proxyBuilder.reloadNginx();
    } else {
        logger.warn("nginx config test failed — skipping reload");
    }
    logger.blank();

    // --- Remove from config ---
    configManager.removeDomain(domain);

    // --- Summary ---
    logger.success(`Domain ${domain} deleted successfully`);
};
