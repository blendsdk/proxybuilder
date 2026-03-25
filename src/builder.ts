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

import { CertMethod, DnsProviderName, IProxyConfig, ProxyMode } from "./types";
import { CERTBOT_BIN, CONFIG_FILENAME, DH_PARAM_BITS, FOLDERS, LE_STAGING_NOTE } from "./constants";
import { ConfigManager } from "./config";
import { Logger } from "./logger";
import { Shell } from "./shell";
import { generateServerName, generateUpstreamName, generateUpstreamServers, renderTemplate } from "./template";

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
        // wwwFolder is the webroot where certbot writes challenge files.
        renderTemplate(
            "letsencrypt.conf",
            { wwwFolder: path.join(this.target, FOLDERS.letsencrypt) },
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

    // -----------------------------------------------------------------------
    // Domain Lifecycle — App Folder
    // -----------------------------------------------------------------------

    /**
     * Create the per-domain application folder and copy default assets.
     *
     * Creates `<target>/apps/<domain>/` and copies the default
     * maintenance.html page into it. This folder holds all per-domain
     * config snippets (upstream.conf, ssl.conf, maintenance.conf, etc.).
     *
     * @param domain - The domain name (e.g. "api.example.com").
     */
    createDomainApp(domain: string): void {
        const appDir = path.join(this.target, FOLDERS.apps, domain);
        fs.mkdirSync(appDir, { recursive: true });
        this.logger.debug(`Created app directory: ${appDir}`);

        // Copy the default maintenance.html page to the domain's app folder.
        const srcPage = path.join(__dirname, "templates", "pages", "maintenance.html");
        const destPage = path.join(appDir, "maintenance.html");
        if (fs.existsSync(srcPage)) {
            fs.copyFileSync(srcPage, destPage);
            this.logger.debug("Copied maintenance.html to app folder");
        }
    }

    // -----------------------------------------------------------------------
    // Domain Lifecycle — Template Rendering
    // -----------------------------------------------------------------------

    /**
     * Build the common template variable map for a domain.
     *
     * Centralises the data that every domain template needs, so all
     * render calls use consistent paths and naming.
     *
     * @param domain   - The domain name.
     * @param upstreams - Array of upstream addresses (host:port).
     * @param wildcard - Whether this is a wildcard domain.
     * @returns Key/value map for template placeholders.
     */
    protected buildTemplateData(
        domain: string,
        upstreams: string[],
        wildcard: boolean,
    ): Record<string, string> {
        return {
            domain,
            serverName: generateServerName(domain, wildcard),
            upstreamName: generateUpstreamName(domain),
            upstreamServers: generateUpstreamServers(upstreams),
            appFolder: path.join(this.target, FOLDERS.apps),
            proxyFolder: path.join(this.target, FOLDERS.proxy),
            sslFolder: path.join(this.target, FOLDERS.letsencrypt),
            wwwFolder: path.join(this.target, FOLDERS.letsencrypt),
            logFolder: path.join(this.target, FOLDERS.logs),
        };
    }

    /**
     * Render all nginx config templates for a domain.
     *
     * Selects the correct template set based on proxy mode (passthrough
     * or full) and writes all config snippets to the domain's app folder
     * and the main site config to sites-enabled.
     *
     * @param domain    - The domain name.
     * @param mode      - Proxy mode ("passthrough" or "full").
     * @param upstreams - Array of upstream addresses.
     * @param wildcard  - Whether this is a wildcard domain.
     */
    renderDomainConfigs(
        domain: string,
        mode: ProxyMode,
        upstreams: string[],
        wildcard: boolean,
    ): void {
        this.logger.section("Configuring nginx");

        const data = this.buildTemplateData(domain, upstreams, wildcard);
        const appDir = path.join(this.target, FOLDERS.apps, domain);
        const templateDir = mode; // "passthrough" or "full" matches directory names.

        // Site config → sites-enabled/<domain>.conf
        renderTemplate(
            `${templateDir}/site.conf`,
            data,
            path.join(this.target, FOLDERS.sitesEnabled, `${domain}.conf`),
            this.logger,
        );
        this.logger.success("Rendered site.conf");

        // Upstream config → apps/<domain>/upstream.conf
        renderTemplate(
            `${templateDir}/upstream.conf`,
            data,
            path.join(appDir, "upstream.conf"),
            this.logger,
        );
        this.logger.success(`Rendered upstream.conf (${upstreams.length} server(s), round-robin)`);

        // SSL config → apps/<domain>/ssl.conf
        renderTemplate(
            `${templateDir}/ssl.conf`,
            data,
            path.join(appDir, "ssl.conf"),
            this.logger,
        );
        this.logger.success("Rendered ssl.conf");

        // Maintenance config → apps/<domain>/maintenance.conf
        renderTemplate(
            "maintenance.conf",
            data,
            path.join(appDir, "maintenance.conf"),
            this.logger,
        );
        this.logger.success("Rendered maintenance.conf");

        // Full mode has additional config snippets.
        if (mode === "full") {
            renderTemplate("full/security.conf", data, path.join(appDir, "security.conf"), this.logger);
            this.logger.success("Rendered security.conf");

            renderTemplate("full/general.conf", data, path.join(appDir, "general.conf"), this.logger);
            this.logger.success("Rendered general.conf");

            renderTemplate("full/log.conf", data, path.join(appDir, "log.conf"), this.logger);
            this.logger.success("Rendered log.conf");
        }
    }

    // -----------------------------------------------------------------------
    // Domain Lifecycle — SSL Certificate
    // -----------------------------------------------------------------------

    /**
     * Request an SSL certificate from Let's Encrypt via certbot.
     *
     * Supports two methods:
     * - **webroot**: Uses HTTP-01 challenge (standard domains).
     * - **dns**: Uses DNS-01 challenge via manual hooks (wildcard domains).
     *
     * The `--config-dir`, `--work-dir`, and `--logs-dir` flags point
     * certbot to the proxybuilder-managed directories so all cert data
     * stays within the target folder.
     *
     * @param domain      - The domain name to get a cert for.
     * @param certMethod  - "webroot" or "dns".
     * @param email       - Let's Encrypt contact email.
     * @param staging     - If true, use the Let's Encrypt staging environment.
     * @param dnsProvider - DNS provider name (required when certMethod is "dns").
     */
    requestCertificate(
        domain: string,
        certMethod: CertMethod,
        email: string,
        staging: boolean,
        dnsProvider?: DnsProviderName,
    ): void {
        this.logger.section("Requesting SSL certificate");

        if (staging) {
            this.logger.warn(LE_STAGING_NOTE);
        }

        const configDir = path.join(this.target, FOLDERS.letsencrypt);
        const workDir = path.join(this.target, FOLDERS.letsencrypt, "lib");
        const logsDir = path.join(this.target, FOLDERS.logs);

        // Common certbot flags shared by all methods.
        const commonFlags = [
            `--config-dir ${configDir}`,
            `--work-dir ${workDir}`,
            `--logs-dir ${logsDir}`,
            `--email ${email}`,
            "--agree-tos",
            "--non-interactive",
            `-d ${domain}`,
        ];

        if (staging) {
            commonFlags.push("--test-cert");
        }

        if (certMethod === "webroot") {
            // HTTP-01 challenge — certbot writes files to the webroot.
            const webroot = path.join(this.target, FOLDERS.letsencrypt);
            commonFlags.push(`--webroot -w ${webroot}`);
        } else {
            // DNS-01 challenge — uses manual hooks for DNS record creation.
            // The hook scripts are generated by the dns-setup command.
            const hookDir = path.join(this.target, FOLDERS.dns);
            const authHook = path.join(hookDir, `${dnsProvider}-auth.sh`);
            const cleanupHook = path.join(hookDir, `${dnsProvider}-cleanup.sh`);
            commonFlags.push(
                "--manual",
                "--preferred-challenges dns",
                `--manual-auth-hook ${authHook}`,
                `--manual-cleanup-hook ${cleanupHook}`,
            );
        }

        const cmd = `${CERTBOT_BIN} certonly ${commonFlags.join(" ")}`;
        this.shell.exec(cmd, { fatal: true });
        this.logger.success("Certificate obtained");
    }

    // -----------------------------------------------------------------------
    // Domain Lifecycle — Enable / Disable
    // -----------------------------------------------------------------------

    /**
     * Move a domain's site config between sites-enabled and sites-disabled.
     *
     * Enabling moves the config INTO sites-enabled (nginx will pick it up).
     * Disabling moves it OUT of sites-enabled into sites-disabled.
     *
     * @param domain - The domain name.
     * @param enable - true to enable, false to disable.
     * @returns true if the move was performed, false if already in target state.
     */
    moveDomainConfig(domain: string, enable: boolean): boolean {
        const filename = `${domain}.conf`;
        const enabledPath = path.join(this.target, FOLDERS.sitesEnabled, filename);
        const disabledPath = path.join(this.target, FOLDERS.sitesDisabled, filename);

        if (enable) {
            // Move from disabled → enabled.
            if (fs.existsSync(enabledPath)) {
                this.logger.info(`Domain ${domain} is already enabled`);
                return false;
            }
            if (!fs.existsSync(disabledPath)) {
                throw new Error(`Config file not found in sites-disabled for ${domain}`);
            }
            fs.renameSync(disabledPath, enabledPath);
            this.logger.success(`Enabled ${domain}`);
        } else {
            // Move from enabled → disabled.
            if (fs.existsSync(disabledPath)) {
                this.logger.info(`Domain ${domain} is already disabled`);
                return false;
            }
            if (!fs.existsSync(enabledPath)) {
                throw new Error(`Config file not found in sites-enabled for ${domain}`);
            }
            fs.renameSync(enabledPath, disabledPath);
            this.logger.success(`Disabled ${domain}`);
        }

        return true;
    }

    // -----------------------------------------------------------------------
    // Domain Lifecycle — Delete
    // -----------------------------------------------------------------------

    /**
     * Remove all files associated with a domain.
     *
     * Deletes the site config from both sites-enabled and sites-disabled,
     * and recursively removes the domain's app folder.
     *
     * @param domain - The domain name to clean up.
     */
    deleteDomainFiles(domain: string): void {
        this.logger.section("Removing domain files");

        // Remove site config from sites-enabled.
        const enabledConf = path.join(this.target, FOLDERS.sitesEnabled, `${domain}.conf`);
        if (fs.existsSync(enabledConf)) {
            fs.unlinkSync(enabledConf);
            this.logger.debug(`Removed ${enabledConf}`);
        }

        // Remove site config from sites-disabled.
        const disabledConf = path.join(this.target, FOLDERS.sitesDisabled, `${domain}.conf`);
        if (fs.existsSync(disabledConf)) {
            fs.unlinkSync(disabledConf);
            this.logger.debug(`Removed ${disabledConf}`);
        }

        // Recursively remove the app folder.
        const appDir = path.join(this.target, FOLDERS.apps, domain);
        if (fs.existsSync(appDir)) {
            fs.rmSync(appDir, { recursive: true, force: true });
            this.logger.debug(`Removed ${appDir}`);
        }

        this.logger.success("Domain files removed");
    }

    /**
     * Revoke and delete an SSL certificate via certbot.
     *
     * @param domain  - The domain whose cert should be revoked.
     * @param staging - Whether the cert was issued by the staging environment.
     */
    revokeCertificate(domain: string, staging: boolean): void {
        this.logger.section("Revoking SSL certificate");

        const configDir = path.join(this.target, FOLDERS.letsencrypt);
        const certPath = path.join(configDir, "live", domain, "fullchain.pem");

        if (!fs.existsSync(certPath)) {
            this.logger.warn(`Certificate not found at ${certPath} — skipping revocation`);
            return;
        }

        const flags = [
            `--config-dir ${configDir}`,
            `--cert-path ${certPath}`,
            "--non-interactive",
        ];

        if (staging) {
            flags.push("--test-cert");
        }

        const result = this.shell.exec(
            `${CERTBOT_BIN} revoke ${flags.join(" ")}`,
            { fatal: false },
        );

        if (result.success) {
            this.logger.success("Certificate revoked");
            // Also delete the cert files after revoking.
            this.shell.exec(
                `${CERTBOT_BIN} delete --cert-name ${domain} --config-dir ${configDir} --non-interactive`,
                { fatal: false },
            );
        } else {
            this.logger.warn("Certificate revocation failed — continuing with file cleanup");
        }
    }

    // -----------------------------------------------------------------------
    // Domain Lifecycle — Certificate Info
    // -----------------------------------------------------------------------

    /**
     * Get the expiry date of a domain's SSL certificate.
     *
     * Reads the certificate file and uses openssl to extract the
     * expiry date. Returns "N/A" if the cert file doesn't exist.
     *
     * @param domain - The domain name.
     * @returns ISO date string (YYYY-MM-DD) or "N/A".
     */
    getCertExpiry(domain: string): string {
        const configDir = path.join(this.target, FOLDERS.letsencrypt);
        const certPath = path.join(configDir, "live", domain, "fullchain.pem");

        if (!fs.existsSync(certPath)) {
            return "N/A";
        }

        try {
            const result = this.shell.exec(
                `openssl x509 -enddate -noout -in ${certPath}`,
                { fatal: false, silent: true },
            );

            if (!result.success) {
                return "N/A";
            }

            // Parse "notAfter=Aug 15 12:00:00 2026 GMT" → "2026-08-15"
            const match = result.stdout.match(/notAfter=(.+)/);
            if (!match) {
                return "N/A";
            }

            const date = new Date(match[1].trim());
            return isNaN(date.getTime()) ? "N/A" : date.toISOString().split("T")[0];
        } catch {
            return "N/A";
        }
    }
}
