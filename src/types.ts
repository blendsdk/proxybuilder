/**
 * Core type definitions for the proxybuilder CLI.
 *
 * This module contains all shared types, interfaces, and enums used
 * throughout the application. It has no dependencies on other modules.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Enums & Literal Types
// ---------------------------------------------------------------------------

/** Proxy mode determines how much the reverse proxy handles. */
export type ProxyMode = "passthrough" | "full";

/** Certificate provisioning method used by Let's Encrypt / certbot. */
export type CertMethod = "webroot" | "dns";

/** Supported DNS provider names for DNS-01 challenges. */
export type DnsProviderName = "cloudns" | "namecheap";

/**
 * Log verbosity levels.
 *
 * QUIET suppresses everything except errors.
 * DEBUG enables the most verbose output, including shell commands.
 */
export enum LogLevel {
    QUIET = 0,
    ERROR = 1,
    WARN = 2,
    INFO = 3,
    DEBUG = 4,
}

// ---------------------------------------------------------------------------
// Domain & Config Interfaces
// ---------------------------------------------------------------------------

/**
 * Configuration for a single domain managed by proxybuilder.
 *
 * Stored as a value in `IProxyConfig.domains`.
 */
export interface IDomainConfig {
    /** How the proxy handles requests — passthrough delegates more to upstream. */
    proxyMode: ProxyMode;

    /** Upstream server addresses, e.g. ["127.0.0.1:3000", "127.0.0.1:3001"]. */
    upstreams: string[];

    /** How the SSL certificate was (or will be) provisioned. */
    certMethod: CertMethod;

    /** DNS provider used for DNS-01 challenges (only when certMethod is "dns"). */
    dnsProvider?: DnsProviderName;

    /** Whether the site is currently enabled in nginx. */
    enabled: boolean;

    /** Whether the site is in maintenance mode. */
    maintenance: boolean;

    /** Whether the certificate covers *.domain (wildcard). */
    wildcard: boolean;

    /** Whether the cert was obtained from the Let's Encrypt staging environment. */
    staging: boolean;

    /** ISO 8601 timestamp when the domain was first created. */
    created: string;

    /** ISO 8601 timestamp when the domain config was last modified. */
    updated: string;
}

/**
 * Default settings applied when creating new domains.
 *
 * Users can override these per-domain via CLI flags.
 */
export interface IProxyDefaults {
    proxyMode: ProxyMode;
    certMethod: CertMethod;
}

/**
 * DNS provider credentials stored in the config file.
 *
 * The `provider` field identifies which provider this is for.
 * Additional fields are provider-specific (e.g. apiUser, apiKey).
 */
export interface IDnsCredentials {
    provider: DnsProviderName;
    /** Provider-specific credential fields. */
    [key: string]: string;
}

/**
 * Root configuration file schema (`proxybuilder.json`).
 *
 * This is the single source of truth for all proxybuilder state.
 * It lives at `<targetFolder>/proxybuilder.json`.
 */
export interface IProxyConfig {
    /** Config schema version — currently "2.0". */
    version: string;

    /** Contact email for Let's Encrypt certificate registration. */
    email: string;

    /** Resolved absolute path to the proxybuilder data directory. */
    targetFolder: string;

    /** Default settings for new domains. */
    defaults: IProxyDefaults;

    /** Map of domain name → domain configuration. */
    domains: Record<string, IDomainConfig>;

    /** Map of provider name → DNS credentials. */
    dns: Record<string, IDnsCredentials>;
}

// ---------------------------------------------------------------------------
// Shell & CLI Interfaces
// ---------------------------------------------------------------------------

/**
 * Result of executing a shell command via the Shell executor.
 *
 * Captures stdout, stderr, exit code, and the original command string
 * for logging and debugging purposes.
 */
export interface IShellResult {
    /** Whether the command exited with code 0. */
    success: boolean;

    /** The process exit code. */
    code: number;

    /** Standard output from the command. */
    stdout: string;

    /** Standard error from the command. */
    stderr: string;

    /** The command string that was executed. */
    command: string;
}

/**
 * Common CLI arguments available to all command handlers.
 *
 * These correspond to the global yargs options defined in index.ts.
 */
export interface ICommonArgs {
    /** Target folder for proxybuilder data (default: /opt/proxybuilder). */
    target: string;

    /** Enable verbose (debug-level) output. */
    verbose: boolean;

    /** Suppress all output except errors. */
    quiet: boolean;
}

// ---------------------------------------------------------------------------
// Display Interfaces
// ---------------------------------------------------------------------------

/**
 * Row data for the `list` command's table output.
 *
 * Each field is pre-formatted as a display string.
 */
export interface IDomainTableRow {
    domain: string;
    status: string;
    mode: string;
    upstreams: string;
    certExpiry: string;
    maintenance: string;
    staging: string;
}
