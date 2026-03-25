/**
 * Revoke command — revoke the SSL certificate for a domain.
 *
 * Revokes the certificate via certbot without removing the domain
 * configuration. The domain will continue to be configured but with
 * an invalid certificate until a new one is obtained.
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

/** CLI arguments specific to the `revoke` command. */
interface IRevokeArgs extends ICommonArgs {
    domain: string;
    force: boolean;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

export const command = "revoke";
export const desc = "Revoke SSL certificate for a domain";

export const builder: CommandBuilder = {
    d: {
        alias: "domain",
        type: "string",
        demandOption: true,
        description: "Domain whose certificate to revoke",
    },
    f: {
        alias: "force",
        type: "boolean",
        default: false,
        description: "Skip confirmation prompt",
    },
};

/**
 * Handler for the `proxybuilder revoke` command.
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = async (argv: IRevokeArgs): Promise<void> => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const shell = new Shell(logger, false);
    const target = path.resolve(argv.target);
    const domain = argv.domain;

    logger.section(`Revoking certificate for ${domain}`);
    logger.blank();

    if (!Validator.isValidDomain(domain)) {
        logger.error(`Invalid domain name: "${domain}"`);
        process.exit(1);
    }

    const proxyBuilder = new ProxyBuilder(target, logger, shell);
    const config = proxyBuilder.loadConfig();

    if (!config) {
        logger.error("Not initialized. Run 'proxybuilder init' first.");
        process.exit(1);
    }

    const domainConfig = proxyBuilder.getConfigManager().getDomain(domain);
    if (!domainConfig) {
        logger.error(`Domain "${domain}" not configured.`);
        process.exit(1);
    }

    // Confirmation prompt unless --force.
    if (!argv.force) {
        const confirmed = await new Promise<boolean>((resolve) => {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            rl.question(`Revoke SSL certificate for ${domain}? [y/N]: `, (answer) => {
                rl.close();
                resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
            });
        });
        if (!confirmed) {
            logger.info("Revocation cancelled");
            return;
        }
    }

    proxyBuilder.revokeCertificate(domain, domainConfig.staging);
    logger.blank();
    logger.success(`Certificate for ${domain} revoked`);
    logger.info("Note: Domain config is preserved. Use 'renew --force' to get a new certificate.");
};
