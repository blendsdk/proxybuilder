/**
 * Create command — add a new domain to the reverse proxy.
 *
 * Handles the full domain creation workflow: input validation, app folder
 * setup, SSL certificate provisioning via certbot, nginx config rendering
 * (passthrough or full mode), config test, reload, and config file update.
 *
 * Supports standard domains (HTTP-01 webroot challenge) and wildcard
 * domains (DNS-01 challenge via configured DNS provider).
 *
 * @packageDocumentation
 */

import path from "path";
import { CommandBuilder } from "yargs";

import { CertMethod, DnsProviderName, ICommonArgs, IDomainConfig, LogLevel, ProxyMode } from "../types";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { Validator } from "../validator";
import { ProxyBuilder } from "../builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `create` command. */
interface ICreateArgs extends ICommonArgs {
    /** Domain name or wildcard (e.g. "api.example.com" or "*.example.com"). */
    domain: string;
    /** One or more upstream addresses in host:port format. */
    upstream: string[];
    /** Proxy mode — "passthrough" (default) or "full". */
    mode: ProxyMode;
    /** DNS provider for wildcard cert DNS-01 challenge. */
    "dns-provider"?: DnsProviderName;
    /** Use Let's Encrypt staging environment. */
    staging: boolean;
    /** Show what would happen without executing. */
    "dry-run": boolean;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

/** Yargs command name. */
export const command = "create";

/** Yargs command description shown in `--help`. */
export const desc = "Create a new domain proxy with SSL certificate";

/** Yargs option definitions for the create command. */
export const builder: CommandBuilder = {
    d: {
        alias: "domain",
        type: "string",
        demandOption: true,
        description: "Domain name (or *.example.com for wildcard)",
    },
    u: {
        alias: "upstream",
        type: "array",
        demandOption: true,
        description: "Upstream address(es) in host:port format",
    },
    m: {
        alias: "mode",
        type: "string",
        default: "passthrough",
        choices: ["passthrough", "full"],
        description: "Proxy mode: passthrough or full",
    },
    "dns-provider": {
        type: "string",
        choices: ["cloudns", "namecheap"],
        description: "DNS provider for wildcard cert (DNS-01 challenge)",
    },
    x: {
        alias: "staging",
        type: "boolean",
        default: false,
        description: "Use Let's Encrypt staging environment",
    },
    "dry-run": {
        type: "boolean",
        default: false,
        description: "Show what would happen without executing",
    },
};

/**
 * Handler for the `proxybuilder create` command.
 *
 * Orchestrates the complete domain creation workflow:
 * 1. Validate inputs (domain, upstreams, mode, dns-provider)
 * 2. Load config and check domain doesn't already exist
 * 3. Create app folder with maintenance.html
 * 4. Request SSL certificate via certbot
 * 5. Render all nginx config templates
 * 6. Test nginx config and reload
 * 7. Save domain to proxybuilder.json
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = (argv: ICreateArgs): void => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const dryRun = argv["dry-run"];
    const shell = new Shell(logger, dryRun);
    const target = path.resolve(argv.target);

    const domain = argv.domain;
    const upstreams = argv.upstream.map(String);
    const mode = argv.mode;
    const staging = argv.staging;
    const isWildcard = Validator.isWildcard(domain);
    const dnsProvider = argv["dns-provider"] as DnsProviderName | undefined;

    logger.section(`Creating proxy for ${domain}`);
    logger.blank();

    // --- Input validation ---
    if (!Validator.isValidDomain(domain)) {
        logger.error(`Invalid domain name: "${domain}"`);
        process.exit(1);
    }

    for (const upstream of upstreams) {
        if (!Validator.isValidUpstream(upstream)) {
            logger.error(`Invalid upstream address: "${upstream}" (expected host:port)`);
            process.exit(1);
        }
    }

    if (!Validator.isValidProxyMode(mode)) {
        logger.error(`Invalid proxy mode: "${mode}" (expected "passthrough" or "full")`);
        process.exit(1);
    }

    // Wildcard domains require a DNS provider for DNS-01 challenge.
    if (isWildcard && !dnsProvider) {
        logger.error("Wildcard domains require --dns-provider (cloudns or namecheap)");
        process.exit(1);
    }

    // Determine certificate method based on domain type and flags.
    const certMethod: CertMethod = isWildcard || dnsProvider ? "dns" : "webroot";

    // Log configuration summary.
    logger.info(`Mode: ${mode}`);
    logger.info(`Upstreams: ${upstreams.join(", ")}`);
    logger.info(`Certificate: ${certMethod} (Let's Encrypt ${staging ? "staging" : "production"})`);
    if (isWildcard) {
        logger.info(`Wildcard: yes (DNS provider: ${dnsProvider})`);
    }
    logger.blank();

    // --- Load config ---
    const builder = new ProxyBuilder(target, logger, shell);
    const config = builder.loadConfig();

    if (!config) {
        logger.error("Not initialized. Run 'proxybuilder init' first.");
        process.exit(1);
    }

    const configManager = builder.getConfigManager();

    // Check domain doesn't already exist.
    if (configManager.domainExists(domain)) {
        logger.error(`Domain "${domain}" already exists. Use 'proxybuilder update' to modify.`);
        process.exit(1);
    }

    // --- Create app folder ---
    builder.createDomainApp(domain);
    logger.blank();

    // --- Ensure nginx is running (required for HTTP-01 challenge) ---
    builder.ensureNginxRunning();
    logger.blank();

    // --- Request SSL certificate ---
    builder.requestCertificate(domain, certMethod, config.email, staging, dnsProvider);
    logger.blank();

    // --- Render nginx configs ---
    builder.renderDomainConfigs(domain, mode, upstreams, isWildcard);
    logger.blank();

    // --- Test and reload nginx ---
    const configOk = builder.testNginxConfig();
    if (configOk) {
        builder.reloadNginx();
    } else {
        logger.warn("nginx config test failed — skipping reload");
        logger.warn("Fix the configuration and run 'nginx -t' manually");
    }
    logger.blank();

    // --- Save to config ---
    const now = new Date().toISOString();
    const domainConfig: IDomainConfig = {
        proxyMode: mode,
        upstreams,
        certMethod,
        dnsProvider: dnsProvider,
        enabled: true,
        maintenance: false,
        wildcard: isWildcard,
        staging,
        created: now,
        updated: now,
    };

    configManager.addDomain(domain, domainConfig);

    // --- Summary ---
    logger.blank();
    logger.success(`Domain ${domain} created successfully`);
};
