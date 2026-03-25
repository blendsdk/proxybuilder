/**
 * Cert-info command — display detailed SSL certificate information.
 *
 * Reads the certificate file via openssl and displays subject, issuer,
 * validity dates, days remaining, serial number, SANs, and key type.
 *
 * @packageDocumentation
 */

import fs from "fs";
import path from "path";
import { CommandBuilder } from "yargs";

import { ICommonArgs, LogLevel } from "../types";
import { FOLDERS } from "../constants";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { Validator } from "../validator";
import { ProxyBuilder } from "../builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `cert-info` command. */
interface ICertInfoArgs extends ICommonArgs {
    domain: string;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

export const command = "cert-info";
export const desc = "Display SSL certificate details for a domain";

export const builder: CommandBuilder = {
    d: {
        alias: "domain",
        type: "string",
        demandOption: true,
        description: "Domain to inspect",
    },
};

/**
 * Handler for the `proxybuilder cert-info` command.
 *
 * Reads the certificate and displays detailed information.
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = (argv: ICertInfoArgs): void => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const shell = new Shell(logger, false);
    const target = path.resolve(argv.target);
    const domain = argv.domain;

    logger.section(`Certificate Info: ${domain}`);
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

    // Locate the certificate file.
    const configDir = path.join(target, FOLDERS.letsencrypt);
    const certPath = path.join(configDir, "live", domain, "fullchain.pem");

    if (!fs.existsSync(certPath)) {
        logger.error(`Certificate not found at ${certPath}`);
        logger.info("Has the certificate been provisioned? Try 'proxybuilder renew --force'");
        process.exit(1);
    }

    // Read certificate details via openssl.
    const result = shell.exec(
        `openssl x509 -in ${certPath} -noout -subject -issuer -dates -serial -ext subjectAltName -text`,
        { fatal: false, silent: true },
    );

    if (!result.success) {
        logger.error("Failed to read certificate");
        process.exit(1);
    }

    const output = result.stdout;

    // Parse individual fields from the openssl output.
    const subject = extractField(output, /Subject:\s*(.+)/);
    const issuer = extractField(output, /Issuer:\s*(.+)/);
    const validFrom = extractField(output, /Not Before:\s*(.+)/);
    const validUntil = extractField(output, /Not After\s*:\s*(.+)/);
    const serial = extractField(output, /Serial Number:\s*\n?\s*([0-9a-f:]+)/i);
    const keyInfo = extractField(output, /Public-Key:\s*\((.+)\)/);

    // Extract SANs from the subjectAltName extension.
    const sanMatch = output.match(/DNS:([^\n]+)/g);
    const sans = sanMatch
        ? sanMatch.map((s) => s.replace(/DNS:/g, "").trim()).join(", ")
        : domain;

    // Calculate days remaining.
    const expiryDate = validUntil ? new Date(validUntil) : null;
    const daysRemaining = expiryDate
        ? Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

    // Display formatted output.
    console.log("");
    console.log(`  Subject:        ${subject ?? "N/A"}`);
    console.log(`  Issuer:         ${issuer ?? "N/A"}`);
    console.log(`  Valid From:     ${validFrom ?? "N/A"}`);
    console.log(`  Valid Until:    ${validUntil ?? "N/A"}`);
    console.log(`  Days Remaining: ${daysRemaining ?? "N/A"}`);
    console.log(`  Serial:         ${serial ?? "N/A"}`);
    console.log(`  SANs:           ${sans}`);
    console.log(`  Staging:        ${domainConfig.staging ? "Yes" : "No"}`);
    console.log(`  Key Type:       ${keyInfo ?? "N/A"}`);
    console.log("");
    console.log(`  Certificate Path: ${certPath}`);
    console.log("");
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a field from openssl text output using a regex.
 *
 * @param text  - The full openssl output text.
 * @param regex - Pattern with one capture group for the value.
 * @returns The captured value, trimmed, or null if not found.
 */
function extractField(text: string, regex: RegExp): string | null {
    const match = text.match(regex);
    return match?.[1]?.trim() ?? null;
}
