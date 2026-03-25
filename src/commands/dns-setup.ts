/**
 * DNS-setup command — configure DNS provider credentials for DNS-01 challenges.
 *
 * Prompts for provider-specific API credentials, optionally tests them,
 * stores them in proxybuilder.json, and generates the certbot hook scripts
 * used during wildcard certificate provisioning.
 *
 * @packageDocumentation
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { CommandBuilder } from "yargs";

import { DnsProviderName, ICommonArgs, IDnsCredentials, LogLevel } from "../types";
import { FOLDERS } from "../constants";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { ProxyBuilder } from "../builder";
import { getProvider, loadProviders } from "../dns/provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `dns-setup` command. */
interface IDnsSetupArgs extends ICommonArgs {
    provider: DnsProviderName;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

export const command = "dns-setup";
export const desc = "Configure DNS provider for wildcard certificates";

export const builder: CommandBuilder = {
    p: {
        alias: "provider",
        type: "string",
        demandOption: true,
        choices: ["cloudns", "namecheap"],
        description: "DNS provider to configure",
    },
};

/**
 * Handler for the `proxybuilder dns-setup` command.
 *
 * Prompts for credentials, stores them, and generates hook scripts.
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = async (argv: IDnsSetupArgs): Promise<void> => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const shell = new Shell(logger, false);
    const target = path.resolve(argv.target);
    const providerName = argv.provider;

    logger.section(`DNS Provider Setup: ${providerName}`);
    logger.blank();

    // Load DNS provider implementations.
    loadProviders();
    const provider = getProvider(providerName);

    if (!provider) {
        logger.error(`Unknown DNS provider: "${providerName}". Available: cloudns, namecheap`);
        process.exit(1);
    }

    // Load config.
    const proxyBuilder = new ProxyBuilder(target, logger, shell);
    const config = proxyBuilder.loadConfig();

    if (!config) {
        logger.error("Not initialized. Run 'proxybuilder init' first.");
        process.exit(1);
    }

    // Prompt for credentials.
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const credentials: Record<string, string> = { provider: providerName };

    for (const field of provider.credentialFields) {
        const value = await new Promise<string>((resolve) => {
            rl.question(`  ${field.description}: `, (answer) => resolve(answer.trim()));
        });

        if (!value) {
            rl.close();
            logger.error(`${field.description} is required`);
            process.exit(1);
        }
        credentials[field.name] = value;
    }
    rl.close();
    logger.blank();

    // Test credentials if the provider supports it.
    logger.info("Testing credentials...");
    const valid = await provider.testCredentials(credentials);

    if (!valid) {
        logger.error("DNS API authentication failed. Check your credentials.");
        process.exit(1);
    }
    logger.success("Credentials verified");
    logger.blank();

    // Store credentials in config.
    const configManager = proxyBuilder.getConfigManager();
    configManager.setDnsCredentials(providerName, credentials as IDnsCredentials);
    logger.success("Credentials saved to config");

    // Generate hook scripts for certbot.
    generateHookScripts(target, providerName, logger);

    logger.blank();
    logger.success(`DNS provider ${provider.displayName} configured`);
    logger.info("You can now create wildcard domains with --dns-provider " + providerName);
};

// ---------------------------------------------------------------------------
// Hook Script Generation
// ---------------------------------------------------------------------------

/**
 * Generate certbot auth and cleanup hook scripts for a DNS provider.
 *
 * These scripts are called by certbot during DNS-01 challenges. They
 * invoke the internal `dns-challenge` command to create/delete TXT records.
 *
 * @param target       - Proxybuilder target directory.
 * @param providerName - DNS provider name.
 * @param logger       - Logger for output.
 */
function generateHookScripts(target: string, providerName: string, logger: Logger): void {
    const dnsDir = path.join(target, FOLDERS.dns);
    fs.mkdirSync(dnsDir, { recursive: true });

    // Resolve the proxybuilder binary path for use in hook scripts.
    const binPath = path.resolve(path.join(__dirname, "..", "index.js"));

    // Auth hook — creates the TXT record.
    const authScript = [
        "#!/bin/bash",
        `# Auto-generated by proxybuilder dns-setup (provider: ${providerName})`,
        `node ${binPath} dns-challenge \\`,
        `  --action create \\`,
        `  --domain "$CERTBOT_DOMAIN" \\`,
        `  --token "$CERTBOT_VALIDATION" \\`,
        `  --provider ${providerName} \\`,
        `  --target ${target}`,
    ].join("\n") + "\n";

    const authPath = path.join(dnsDir, `${providerName}-auth.sh`);
    fs.writeFileSync(authPath, authScript, { mode: 0o700 });
    logger.success(`Generated ${authPath}`);

    // Cleanup hook — deletes the TXT record.
    const cleanupScript = [
        "#!/bin/bash",
        `# Auto-generated by proxybuilder dns-setup (provider: ${providerName})`,
        `node ${binPath} dns-challenge \\`,
        `  --action cleanup \\`,
        `  --domain "$CERTBOT_DOMAIN" \\`,
        `  --token "$CERTBOT_VALIDATION" \\`,
        `  --provider ${providerName} \\`,
        `  --target ${target}`,
    ].join("\n") + "\n";

    const cleanupPath = path.join(dnsDir, `${providerName}-cleanup.sh`);
    fs.writeFileSync(cleanupPath, cleanupScript, { mode: 0o700 });
    logger.success(`Generated ${cleanupPath}`);
}
