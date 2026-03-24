/**
 * Configuration manager for the proxybuilder CLI.
 *
 * Reads and writes the `proxybuilder.json` config file that stores
 * all domain configurations, DNS credentials, and proxy defaults.
 * The config file is the single source of truth for proxybuilder state.
 *
 * File permissions are set to 600 (owner read/write only) because
 * the config may contain DNS provider credentials.
 *
 * @packageDocumentation
 */

import fs from "fs";
import path from "path";

import {
    DnsProviderName,
    IDnsCredentials,
    IDomainConfig,
    IProxyConfig,
} from "./types";
import { CONFIG_FILENAME, CONFIG_VERSION, DEFAULT_EMAIL, DEFAULT_PROXY } from "./constants";
import { Logger } from "./logger";

// ---------------------------------------------------------------------------
// ConfigManager
// ---------------------------------------------------------------------------

/**
 * Manages the proxybuilder JSON configuration file.
 *
 * Provides CRUD operations for domains and DNS credentials, with
 * automatic persistence (save-on-mutate) and atomic writes to
 * prevent file corruption.
 *
 * Usage:
 * ```ts
 * const config = new ConfigManager("/opt/proxybuilder", logger);
 * if (config.load()) {
 *     const domain = config.getDomain("api.example.com");
 * }
 * ```
 */
export class ConfigManager {
    /** Absolute path to the proxybuilder.json file. */
    protected configPath: string;

    /** In-memory representation of the config. */
    protected config: IProxyConfig;

    /** Logger for info/error messages during config operations. */
    protected logger: Logger;

    /**
     * Create a new ConfigManager.
     *
     * Initialises with an empty in-memory config. Call `load()` to read
     * from disk or `create()` to initialise a new config file.
     *
     * @param targetFolder - Absolute path to the proxybuilder data directory.
     * @param logger       - Logger instance for output.
     */
    constructor(targetFolder: string, logger: Logger) {
        this.configPath = path.join(targetFolder, CONFIG_FILENAME);
        this.logger = logger;

        // Start with a valid empty config in memory.
        this.config = {
            version: CONFIG_VERSION,
            email: DEFAULT_EMAIL,
            targetFolder,
            defaults: { ...DEFAULT_PROXY },
            domains: {},
            dns: {},
        };
    }

    // -----------------------------------------------------------------------
    // File Operations
    // -----------------------------------------------------------------------

    /**
     * Load the config file from disk into memory.
     *
     * Returns false if the file does not exist (not an error — the user
     * just needs to run `init` first). Throws on corrupt JSON or
     * version mismatches so the user gets a clear error.
     *
     * @returns true if the config was loaded successfully, false if the file doesn't exist.
     * @throws Error if the file exists but contains invalid JSON or an unsupported version.
     */
    load(): boolean {
        if (!fs.existsSync(this.configPath)) {
            this.logger.debug("Config file not found", { path: this.configPath });
            return false;
        }

        let raw: string;
        try {
            raw = fs.readFileSync(this.configPath, "utf-8");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to read config file at ${this.configPath}: ${message}`);
        }

        let parsed: IProxyConfig;
        try {
            parsed = JSON.parse(raw) as IProxyConfig;
        } catch {
            throw new Error(
                `Config file at ${this.configPath} contains invalid JSON. ` +
                `Please fix it manually or delete it and run 'proxybuilder init' again.`
            );
        }

        // Validate the config schema version.
        if (parsed.version !== CONFIG_VERSION) {
            this.logger.warn(
                `Config version mismatch: found "${parsed.version}", expected "${CONFIG_VERSION}". ` +
                `Consider migrating your config.`
            );
        }

        this.config = parsed;
        this.logger.debug("Config loaded", { path: this.configPath });
        return true;
    }

    /**
     * Save the current in-memory config to disk.
     *
     * Uses an atomic write strategy: writes to a `.tmp` file first,
     * then renames it over the original. This prevents data loss if
     * the process is interrupted mid-write.
     *
     * File permissions are set to 0600 (owner read/write only) because
     * the config may contain DNS provider credentials.
     */
    save(): void {
        const tmpPath = this.configPath + ".tmp";
        const json = JSON.stringify(this.config, null, 2) + "\n";

        try {
            // Ensure the parent directory exists.
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Write to temp file, then atomically rename.
            fs.writeFileSync(tmpPath, json, { mode: 0o600 });
            fs.renameSync(tmpPath, this.configPath);
            this.logger.debug("Config saved", { path: this.configPath });
        } catch (err: unknown) {
            // Clean up the tmp file if rename failed.
            try {
                if (fs.existsSync(tmpPath)) {
                    fs.unlinkSync(tmpPath);
                }
            } catch {
                // Ignore cleanup errors.
            }

            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to save config file: ${message}`);
        }
    }

    /**
     * Create and persist a new initial config file.
     *
     * Called by the `init` command when setting up proxybuilder for
     * the first time.
     *
     * @param email - Contact email for Let's Encrypt registration.
     */
    create(email: string): void {
        this.config = {
            version: CONFIG_VERSION,
            email,
            targetFolder: path.dirname(this.configPath),
            defaults: { ...DEFAULT_PROXY },
            domains: {},
            dns: {},
        };
        this.save();
        this.logger.info("Config file created", { path: this.configPath });
    }

    /**
     * Check whether the config file exists on disk.
     *
     * @returns true if the file exists.
     */
    exists(): boolean {
        return fs.existsSync(this.configPath);
    }

    /**
     * Get a readonly snapshot of the full config.
     *
     * @returns The current in-memory config (frozen reference).
     */
    getConfig(): Readonly<IProxyConfig> {
        return this.config;
    }

    // -----------------------------------------------------------------------
    // Domain Operations
    // -----------------------------------------------------------------------

    /**
     * Get the configuration for a single domain.
     *
     * @param domain - The domain name to look up.
     * @returns The domain config, or undefined if not found.
     */
    getDomain(domain: string): IDomainConfig | undefined {
        return this.config.domains[domain];
    }

    /**
     * Add a new domain to the config and persist.
     *
     * @param domain - The domain name (e.g. "api.example.com").
     * @param config - The full domain configuration.
     * @throws Error if the domain already exists.
     */
    addDomain(domain: string, config: IDomainConfig): void {
        if (this.config.domains[domain]) {
            throw new Error(`Domain "${domain}" already exists in config`);
        }
        this.config.domains[domain] = config;
        this.save();
        this.logger.debug("Domain added to config", { domain });
    }

    /**
     * Update an existing domain's config with partial changes and persist.
     *
     * Merges the provided updates into the existing config. Automatically
     * updates the `updated` timestamp.
     *
     * @param domain  - The domain name to update.
     * @param updates - Partial config fields to merge.
     * @throws Error if the domain does not exist.
     */
    updateDomain(domain: string, updates: Partial<IDomainConfig>): void {
        const existing = this.config.domains[domain];
        if (!existing) {
            throw new Error(`Domain "${domain}" not found in config`);
        }
        this.config.domains[domain] = {
            ...existing,
            ...updates,
            updated: new Date().toISOString(),
        };
        this.save();
        this.logger.debug("Domain updated in config", { domain });
    }

    /**
     * Remove a domain from the config and persist.
     *
     * @param domain - The domain name to remove.
     * @throws Error if the domain does not exist.
     */
    removeDomain(domain: string): void {
        if (!this.config.domains[domain]) {
            throw new Error(`Domain "${domain}" not found in config`);
        }
        delete this.config.domains[domain];
        this.save();
        this.logger.debug("Domain removed from config", { domain });
    }

    /**
     * List all domains with their configurations.
     *
     * @returns Array of `{ domain, config }` pairs, sorted alphabetically by domain.
     */
    listDomains(): Array<{ domain: string; config: IDomainConfig }> {
        return Object.entries(this.config.domains)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([domain, config]) => ({ domain, config }));
    }

    /**
     * Check whether a domain exists in the config.
     *
     * @param domain - The domain name to check.
     * @returns true if the domain is configured.
     */
    domainExists(domain: string): boolean {
        return domain in this.config.domains;
    }

    // -----------------------------------------------------------------------
    // DNS Credential Operations
    // -----------------------------------------------------------------------

    /**
     * Get stored DNS credentials for a provider.
     *
     * @param provider - The DNS provider name.
     * @returns The credentials object, or undefined if not configured.
     */
    getDnsCredentials(provider: DnsProviderName): IDnsCredentials | undefined {
        return this.config.dns[provider];
    }

    /**
     * Store DNS credentials for a provider and persist.
     *
     * Overwrites any existing credentials for the same provider.
     *
     * @param provider    - The DNS provider name.
     * @param credentials - The credentials object to store.
     */
    setDnsCredentials(provider: DnsProviderName, credentials: IDnsCredentials): void {
        this.config.dns[provider] = credentials;
        this.save();
        this.logger.debug("DNS credentials saved", { provider });
    }

    // -----------------------------------------------------------------------
    // Convenience Getters
    // -----------------------------------------------------------------------

    /**
     * Get the resolved target folder path from the config.
     *
     * @returns The absolute path to the proxybuilder data directory.
     */
    getTargetFolder(): string {
        return this.config.targetFolder;
    }

    /**
     * Get the configured Let's Encrypt contact email.
     *
     * @returns The email address string.
     */
    getEmail(): string {
        return this.config.email;
    }
}
