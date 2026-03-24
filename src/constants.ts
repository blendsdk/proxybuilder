/**
 * Application-wide constants and default values.
 *
 * Centralises all magic strings, default paths, and configuration
 * defaults so they can be referenced consistently across the codebase.
 *
 * @packageDocumentation
 */

import { IProxyDefaults, LogLevel } from "./types";

// ---------------------------------------------------------------------------
// Paths & Filenames
// ---------------------------------------------------------------------------

/** Default target folder where proxybuilder stores all data. */
export const DEFAULT_TARGET = "/opt/proxybuilder";

/** Name of the JSON config file within the target folder. */
export const CONFIG_FILENAME = "proxybuilder.json";

/** Config schema version — used to detect outdated config files. */
export const CONFIG_VERSION = "2.0";

/** Filename used as a per-domain maintenance mode flag. */
export const MAINTENANCE_FLAG = "maintenance.flag";

// ---------------------------------------------------------------------------
// External Binaries
// ---------------------------------------------------------------------------

/** Certbot binary name (expected to be on PATH). */
export const CERTBOT_BIN = "certbot";

/** Nginx binary name (expected to be on PATH). */
export const NGINX_BIN = "nginx";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default Let's Encrypt contact email.
 *
 * Empty by default — the user MUST provide an email via `init --email`.
 */
export const DEFAULT_EMAIL = "";

/** Default proxy settings for new domains. */
export const DEFAULT_PROXY: IProxyDefaults = {
    proxyMode: "passthrough",
    certMethod: "webroot",
};

/** Default log level when neither --verbose nor --quiet is passed. */
export const DEFAULT_LOG_LEVEL = LogLevel.INFO;

// ---------------------------------------------------------------------------
// SSL / DH Params
// ---------------------------------------------------------------------------

/** Bit size for Diffie-Hellman parameters generated during `init`. */
export const DH_PARAM_BITS = 2048;

/**
 * Human-readable note logged when the Let's Encrypt staging environment is used.
 * Staging certificates are NOT trusted by browsers.
 */
export const LE_STAGING_NOTE =
    "Using Let's Encrypt STAGING environment (certificates will NOT be trusted by browsers)";

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

/** Cron schedule expression for automatic certificate renewal (daily at 3 AM). */
export const CRON_SCHEDULE = "0 3 * * *";

// ---------------------------------------------------------------------------
// Subfolder Layout
// ---------------------------------------------------------------------------

/**
 * Subfolder names within the target directory.
 *
 * The target directory (e.g. /opt/proxybuilder) is organised into these
 * subdirectories. Commands use these constants to resolve paths rather
 * than hardcoding strings.
 */
export const FOLDERS = {
    /** Root nginx config directory. */
    nginx: "nginx",
    /** Proxy-level shared config snippets. */
    proxy: "proxy",
    /** SSL certificates and keys. */
    ssl: "ssl",
    /** Per-domain application data. */
    apps: "apps",
    /** Log files. */
    logs: "logs",
    /** DNS challenge scripts and credentials. */
    dns: "dns",
    /** Let's Encrypt / certbot working directory. */
    letsencrypt: "letsencrypt",
    /** Nginx sites-enabled directory (symlinks to active configs). */
    sitesEnabled: "nginx/sites-enabled",
    /** Nginx sites-disabled directory (configs for disabled domains). */
    sitesDisabled: "nginx/sites-disabled",
    /** Nginx modules-enabled directory. */
    modulesEnabled: "nginx/modules-enabled",
    /** Nginx conf.d directory for additional config fragments. */
    confD: "nginx/conf.d",
} as const;
