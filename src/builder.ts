/**
 * Core ProxyBuilder class — the engine behind all proxybuilder operations.
 *
 * Orchestrates directory creation, SSL material generation, nginx config
 * rendering, and config management. Commands delegate to this class for
 * the actual work, keeping command handlers thin and focused on CLI concerns.
 *
 * This class is designed for extension in later phases — lifecycle commands
 * (create, delete, enable, disable) will add methods here.
 *
 * @packageDocumentation
 */

import fs from "fs";
import path from "path";

import { IProxyConfig } from "./types";
import { CONFIG_FILENAME, DH_PARAM_BITS, FOLDERS } from "./constants";
import { ConfigManager } from "./config";
import { Logger } from "./logger";
import { Shell } from "./shell";
import { renderTemplate } from "./template";

// ---------------------------------------------------------------------------
// ProxyBuilder
// ---------------------------------------------------------------------------

/**
 * Central orchestrator for proxybuilder operations.
 *
 * Holds references to the shared Logger, Shell, and ConfigManager instances.
 * Commands create a ProxyBuilder instance and call its methods to perform
 * the actual infrastructure work.
 *
 * Usage:
 * ```ts
 * const builder = new ProxyBuilder("/opt/proxybuilder", logger, shell);
 * builder.createDirectoryStructure();
 * builder.generateDhParams();
 * builder.generateSelfSignedCert();
 * builder.renderSharedConfigs();
 * ```
 */
export class ProxyBuilder {
    /** Absolute path to the proxybuilder data directory. */
    protected target: string;

    /** Logger for status output. */
    protected logger: Logger;

    /** Shell executor for running system commands. */
    protected shell: Shell;

    /** Configuration manager for proxybuilder.json. */
    protected configManager: ConfigManager;

    /**
     * Create a new ProxyBuilder instance.
     *
     * @param target - Absolute path to the proxybuilder data directory.
     * @param logger - Logger instance for output.
     * @param shell  - Shell executor instance.
     */
    constructor(target: string, logger: Logger, shell: Shell) {
        this.target = target;
        this.logger = logger;
        this.shell = shell;
        this.configManager = new ConfigManager(target, logger);
    }

    // -----------------------------------------------------------------------
    // Directory Structure
    // -----------------------------------------------------------------------

    /**
     * Create the full proxybuilder directory structure.
     *
     * Creates the target folder and all required subdirectories. Uses
     * `recursive: true` so it's safe to call multiple times (idempotent).
     *
     * Directory layout:
     * ```
     * <target>/
     * ├── nginx/
     * │   ├── sites-enabled/
     * │   ├── sites-disabled/
     * │   ├── modules-enabled/
     * │   └── conf.d/
     * ├── proxy/
     * ├── ssl/
     * ├── apps/
     * ├── logs/
     * ├── letsencrypt/
     * │   └── lib/
     * └── dns/
     * ```
     */
    createDirectoryStructure(): void {
        this.logger.section("Creating directory structure");

        const directories = [
            // Top-level subdirectories.
            FOLDERS.nginx,
            FOLDERS.proxy,
            FOLDERS.ssl,
            FOLDERS.apps,
            FOLDERS.logs,
            FOLDERS.dns,
            FOLDERS.letsencrypt,
            // Nested subdirectories.
            FOLDERS.sitesEnabled,
            FOLDERS.sitesDisabled,
            FOLDERS.modulesEnabled,
            FOLDERS.confD,
            // Let's Encrypt working directory for certbot.
            path.join(FOLDERS.letsencrypt, "lib"),
        ];

        for (const dir of directories) {
            const fullPath = path.join(this.target, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                this.logger.debug(`Created directory: ${fullPath}`);
            } else {
                this.logger.debug(`Directory exists: ${fullPath}`);
            }
        }

        this.logger.success("Directory structure created");
    }

    // -----------------------------------------------------------------------
    // SSL Material Generation
    // -----------------------------------------------------------------------

    /**
     * Generate Diffie-Hellman parameters for nginx SSL.
     *
     * DH params are used by nginx for perfect forward secrecy in TLS
     * connections. This is a one-time operation that takes 30-60 seconds.
     * Skips generation if the file already exists (idempotent).
     *
     * Output: `<target>/dhparam.pem`
     */
    generateDhParams(): void {
        const dhParamPath = path.join(this.target, "dhparam.pem");

        if (fs.existsSync(dhParamPath)) {
            this.logger.info("DH parameters already exist — skipping generation");
            return;
        }

        this.logger.section("Generating DH parameters");
        this.logger.info(`Generating ${DH_PARAM_BITS}-bit DH parameters (this may take a moment)...`);

        this.shell.exec(
            `openssl dhparam -out ${dhParamPath} ${DH_PARAM_BITS}`,
            { fatal: true },
        );

        this.logger.success("DH parameters generated");
    }

    /**
     * Generate a self-signed SSL certificate for nginx default server.
     *
     * The self-signed cert is used as a fallback for the nginx default
     * server block and during initial setup before Let's Encrypt certs
     * are provisioned. Skips if files already exist (idempotent).
     *
     * Output:
     * - `<target>/ssl/self-ssl.key`
     * - `<target>/ssl/self-ssl.crt`
     */
    generateSelfSignedCert(): void {
        const keyPath = path.join(this.target, FOLDERS.ssl, "self-ssl.key");
        const certPath = path.join(this.target, FOLDERS.ssl, "self-ssl.crt");

        if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            this.logger.info("Self-signed certificate already exists — skipping generation");
            return;
        }

        this.logger.section("Generating self-signed certificate");

        this.shell.exec(
            `openssl req -batch -x509 -nodes -days 365 ` +
            `-newkey rsa:2048 ` +
            `-keyout ${keyPath} ` +
            `-out ${certPath}`,
            { fatal: true },
        );

        this.logger.success("Self-signed certificate generated");
    }

    // -----------------------------------------------------------------------
    // Nginx Config Rendering
    // -----------------------------------------------------------------------

    /**
     * Render the main nginx.conf and shared proxy config files.
     *
     * These are always re-rendered (not idempotent) to pick up any
     * template changes from a proxybuilder upgrade.
     *
     * Renders:
     * - `nginx.conf` → `<target>/nginx/nginx.conf`
     * - `proxy.conf` → `<target>/proxy/proxy.conf`
     * - `letsencrypt.conf` → `<target>/proxy/letsencrypt.conf`
     */
    renderSharedConfigs(): void {
        this.logger.section("Rendering shared configurations");

        // Main nginx.conf — the root nginx configuration.
        renderTemplate(
            "nginx.conf",
            {
                target: this.target,
                ssl_key: path.join(this.target, FOLDERS.ssl, "self-ssl.key"),
                ssl_cert: path.join(this.target, FOLDERS.ssl, "self-ssl.crt"),
                dhparam: path.join(this.target, "dhparam.pem"),
                sites_enabled: path.join(this.target, FOLDERS.sitesEnabled),
                modules_enabled: path.join(this.target, FOLDERS.modulesEnabled),
                conf_d: path.join(this.target, FOLDERS.confD),
            },
            path.join(this.target, FOLDERS.nginx, "nginx.conf"),
            this.logger,
        );
        this.logger.success("Rendered nginx.conf");

        // Shared proxy settings included by all site configs.
        renderTemplate(
            "proxy.conf",
            { target: this.target },
            path.join(this.target, FOLDERS.proxy, "proxy.conf"),
            this.logger,
        );
        this.logger.success("Rendered proxy.conf");

        // Let's Encrypt ACME challenge location block.
        renderTemplate(
            "letsencrypt.conf",
            { target: this.target },
            path.join(this.target, FOLDERS.proxy, "letsencrypt.conf"),
            this.logger,
        );
        this.logger.success("Rendered letsencrypt.conf");
    }

    // -----------------------------------------------------------------------
    // Nginx Symlink Management
    // -----------------------------------------------------------------------

    /**
     * Create or update the nginx.conf symlink at `/etc/nginx/nginx.conf`.
     *
     * Backs up the existing nginx.conf before replacing it with a symlink
     * to the proxybuilder-managed config. This allows proxybuilder to
     * control nginx entirely while preserving the original config.
     */
    installNginxSymlink(): void {
        const systemNginxConf = "/etc/nginx/nginx.conf";
        const proxyNginxConf = path.join(this.target, FOLDERS.nginx, "nginx.conf");

        this.logger.section("Installing nginx.conf symlink");

        // Check if the target nginx.conf file exists.
        if (!fs.existsSync(proxyNginxConf)) {
            throw new Error(`Proxybuilder nginx.conf not found at ${proxyNginxConf}. Run renderSharedConfigs() first.`);
        }

        // If /etc/nginx/nginx.conf exists and is NOT already a symlink to ours, back it up.
        if (fs.existsSync(systemNginxConf)) {
            const stats = fs.lstatSync(systemNginxConf);
            if (stats.isSymbolicLink()) {
                const linkTarget = fs.readlinkSync(systemNginxConf);
                if (linkTarget === proxyNginxConf) {
                    this.logger.info("Symlink already points to proxybuilder — skipping");
                    return;
                }
            }
            // Back up the existing file/symlink.
            const backupPath = `${systemNginxConf}.backup.${Date.now()}`;
            this.shell.exec(`cp -a ${systemNginxConf} ${backupPath}`, { fatal: false });
            this.logger.info(`Backed up existing nginx.conf to ${backupPath}`);
        }

        // Create the symlink.
        this.shell.exec(`ln -sf ${proxyNginxConf} ${systemNginxConf}`, { fatal: true });
        this.logger.success(`Symlinked ${systemNginxConf} → ${proxyNginxConf}`);
    }

    // -----------------------------------------------------------------------
    // Nginx Validation & Reload
    // -----------------------------------------------------------------------

    /**
     * Test the nginx configuration for syntax errors.
     *
     * Runs `nginx -t` and returns whether the config is valid.
     * Does not reload nginx — call `reloadNginx()` separately.
     *
     * @returns true if the nginx config test passes.
     */
    testNginxConfig(): boolean {
        this.logger.section("Testing nginx configuration");

        const result = this.shell.exec("nginx -t", { fatal: false });

        if (result.success) {
            this.logger.success("nginx configuration test passed");
        } else {
            this.logger.error("nginx configuration test failed");
            // Show the error output so the user can diagnose.
            if (result.stderr) {
                this.logger.error(result.stderr.trim());
            }
        }

        return result.success;
    }

    /**
     * Reload the nginx process to apply configuration changes.
     *
     * Sends SIGHUP to nginx (graceful reload), which picks up config
     * changes without dropping existing connections.
     */
    reloadNginx(): void {
        this.logger.section("Reloading nginx");
        this.shell.exec("nginx -s reload", { fatal: true });
        this.logger.success("nginx reloaded");
    }

    // -----------------------------------------------------------------------
    // Config File Management
    // -----------------------------------------------------------------------

    /**
     * Initialize the proxybuilder.json config file.
     *
     * Creates a new config file if one doesn't exist. If a config
     * file already exists, validates its version but does not overwrite.
     *
     * @param email - Let's Encrypt contact email address.
     * @returns true if a new config was created, false if one already existed.
     */
    initConfig(email: string): boolean {
        if (this.configManager.exists()) {
            // Config already exists — load and validate version.
            this.configManager.load();
            this.logger.info(`Config already exists at ${this.getConfigPath()}`);
            return false;
        }

        this.configManager.create(email);
        this.logger.success(`Config created at ${this.getConfigPath()}`);
        return true;
    }

    /**
     * Get the config manager for direct access by commands.
     *
     * @returns The ConfigManager instance.
     */
    getConfigManager(): ConfigManager {
        return this.configManager;
    }

    /**
     * Get the full path to the proxybuilder.json config file.
     *
     * @returns Absolute path to the config file.
     */
    getConfigPath(): string {
        return path.join(this.target, CONFIG_FILENAME);
    }

    /**
     * Load the existing config and return it.
     *
     * Convenience method that loads the config and returns a readonly snapshot.
     *
     * @returns The loaded config, or null if no config file exists.
     */
    loadConfig(): Readonly<IProxyConfig> | null {
        if (!this.configManager.load()) {
            return null;
        }
        return this.configManager.getConfig();
    }

    // -----------------------------------------------------------------------
    // Accessors
    // -----------------------------------------------------------------------

    /**
     * Get the target directory path.
     *
     * @returns The absolute path to the proxybuilder data directory.
     */
    getTarget(): string {
        return this.target;
    }

    /**
     * Resolve a path relative to the target directory.
     *
     * @param segments - Path segments to join with the target.
     * @returns The resolved absolute path.
     */
    resolvePath(...segments: string[]): string {
        return path.join(this.target, ...segments);
    }
}
