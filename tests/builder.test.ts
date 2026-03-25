/**
 * Tests for the ProxyBuilder class — filesystem operations.
 *
 * Covers directory structure creation, domain app folder management,
 * config move (enable/disable), domain file deletion, config lifecycle,
 * path accessors, and template rendering for both passthrough and full modes.
 *
 * Uses real temporary directories — no mocks for filesystem operations.
 *
 * @packageDocumentation
 */

import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { ProxyBuilder } from "../src/builder";
import { Logger } from "../src/logger";
import { Shell } from "../src/shell";
import { LogLevel } from "../src/types";
import { FOLDERS, CONFIG_FILENAME } from "../src/constants";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Create a Logger with QUIET level so tests produce no console output. */
function createQuietLogger(): Logger {
    return new Logger(LogLevel.QUIET);
}

/**
 * Create a ProxyBuilder instance backed by a temp directory.
 * Uses dry-run shell so no external commands are actually executed.
 */
function createTestBuilder(target: string): {
    builder: ProxyBuilder;
    logger: Logger;
    shell: Shell;
} {
    const logger = createQuietLogger();
    const shell = new Shell(logger, true); // Dry-run for external commands.
    const builder = new ProxyBuilder(target, logger, shell);
    return { builder, logger, shell };
}

// ---------------------------------------------------------------------------
// Directory Structure
// ---------------------------------------------------------------------------

describe("ProxyBuilder — Directory Structure", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-builder-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should create all required directories", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.createDirectoryStructure();

        // Verify all FOLDERS entries exist as directories.
        const expectedDirs = [
            FOLDERS.nginx,
            FOLDERS.proxy,
            FOLDERS.ssl,
            FOLDERS.apps,
            FOLDERS.logs,
            FOLDERS.dns,
            FOLDERS.letsencrypt,
            FOLDERS.sitesEnabled,
            FOLDERS.sitesDisabled,
            FOLDERS.modulesEnabled,
            FOLDERS.confD,
        ];

        for (const dir of expectedDirs) {
            const fullPath = path.join(tmpDir, dir);
            expect(fs.existsSync(fullPath), `Missing directory: ${dir}`).toBe(true);
            expect(fs.statSync(fullPath).isDirectory()).toBe(true);
        }
    });

    it("should create the letsencrypt/lib working directory", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.createDirectoryStructure();

        const libDir = path.join(tmpDir, FOLDERS.letsencrypt, "lib");
        expect(fs.existsSync(libDir)).toBe(true);
        expect(fs.statSync(libDir).isDirectory()).toBe(true);
    });

    it("should be idempotent (safe to call multiple times)", () => {
        const { builder } = createTestBuilder(tmpDir);

        // Call twice — should not throw.
        builder.createDirectoryStructure();
        builder.createDirectoryStructure();

        // Directories should still exist.
        expect(fs.existsSync(path.join(tmpDir, FOLDERS.nginx))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Domain App Folder
// ---------------------------------------------------------------------------

describe("ProxyBuilder — Domain App Folder", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-builder-test-"));
        const { builder } = createTestBuilder(tmpDir);
        builder.createDirectoryStructure();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should create the domain app directory", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.createDomainApp("api.example.com");

        const appDir = path.join(tmpDir, FOLDERS.apps, "api.example.com");
        expect(fs.existsSync(appDir)).toBe(true);
        expect(fs.statSync(appDir).isDirectory()).toBe(true);
    });

    it("should be idempotent for the same domain", () => {
        const { builder } = createTestBuilder(tmpDir);

        builder.createDomainApp("api.example.com");
        builder.createDomainApp("api.example.com");

        const appDir = path.join(tmpDir, FOLDERS.apps, "api.example.com");
        expect(fs.existsSync(appDir)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Domain Config Move (Enable/Disable)
// ---------------------------------------------------------------------------

describe("ProxyBuilder — moveDomainConfig", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-builder-test-"));
        const { builder } = createTestBuilder(tmpDir);
        builder.createDirectoryStructure();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should move config from sites-enabled to sites-disabled (disable)", () => {
        const { builder } = createTestBuilder(tmpDir);
        const domain = "api.example.com";

        // Create a config file in sites-enabled.
        const enabledPath = path.join(tmpDir, FOLDERS.sitesEnabled, `${domain}.conf`);
        fs.writeFileSync(enabledPath, "# test config\n");

        const moved = builder.moveDomainConfig(domain, false);

        expect(moved).toBe(true);
        expect(fs.existsSync(enabledPath)).toBe(false);

        const disabledPath = path.join(tmpDir, FOLDERS.sitesDisabled, `${domain}.conf`);
        expect(fs.existsSync(disabledPath)).toBe(true);
    });

    it("should move config from sites-disabled to sites-enabled (enable)", () => {
        const { builder } = createTestBuilder(tmpDir);
        const domain = "api.example.com";

        // Create a config file in sites-disabled.
        const disabledPath = path.join(tmpDir, FOLDERS.sitesDisabled, `${domain}.conf`);
        fs.writeFileSync(disabledPath, "# test config\n");

        const moved = builder.moveDomainConfig(domain, true);

        expect(moved).toBe(true);
        expect(fs.existsSync(disabledPath)).toBe(false);

        const enabledPath = path.join(tmpDir, FOLDERS.sitesEnabled, `${domain}.conf`);
        expect(fs.existsSync(enabledPath)).toBe(true);
    });

    it("should return false if domain is already enabled", () => {
        const { builder } = createTestBuilder(tmpDir);
        const domain = "api.example.com";

        // Config already in sites-enabled.
        const enabledPath = path.join(tmpDir, FOLDERS.sitesEnabled, `${domain}.conf`);
        fs.writeFileSync(enabledPath, "# test config\n");

        const moved = builder.moveDomainConfig(domain, true);
        expect(moved).toBe(false);
    });

    it("should return false if domain is already disabled", () => {
        const { builder } = createTestBuilder(tmpDir);
        const domain = "api.example.com";

        // Config already in sites-disabled.
        const disabledPath = path.join(tmpDir, FOLDERS.sitesDisabled, `${domain}.conf`);
        fs.writeFileSync(disabledPath, "# test config\n");

        const moved = builder.moveDomainConfig(domain, false);
        expect(moved).toBe(false);
    });

    it("should throw when enabling a domain with no config in sites-disabled", () => {
        const { builder } = createTestBuilder(tmpDir);

        expect(() => {
            builder.moveDomainConfig("nonexistent.com", true);
        }).toThrow(/Config file not found/);
    });

    it("should throw when disabling a domain with no config in sites-enabled", () => {
        const { builder } = createTestBuilder(tmpDir);

        expect(() => {
            builder.moveDomainConfig("nonexistent.com", false);
        }).toThrow(/Config file not found/);
    });

    it("should preserve file content during move", () => {
        const { builder } = createTestBuilder(tmpDir);
        const domain = "api.example.com";
        const content = "server { listen 443 ssl; }";

        const enabledPath = path.join(tmpDir, FOLDERS.sitesEnabled, `${domain}.conf`);
        fs.writeFileSync(enabledPath, content);

        builder.moveDomainConfig(domain, false);

        const disabledPath = path.join(tmpDir, FOLDERS.sitesDisabled, `${domain}.conf`);
        expect(fs.readFileSync(disabledPath, "utf-8")).toBe(content);
    });
});

// ---------------------------------------------------------------------------
// Domain File Deletion
// ---------------------------------------------------------------------------

describe("ProxyBuilder — deleteDomainFiles", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-builder-test-"));
        const { builder } = createTestBuilder(tmpDir);
        builder.createDirectoryStructure();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should remove the site config from sites-enabled", () => {
        const { builder } = createTestBuilder(tmpDir);
        const domain = "api.example.com";

        const confPath = path.join(tmpDir, FOLDERS.sitesEnabled, `${domain}.conf`);
        fs.writeFileSync(confPath, "# config");

        builder.deleteDomainFiles(domain);

        expect(fs.existsSync(confPath)).toBe(false);
    });

    it("should remove the site config from sites-disabled", () => {
        const { builder } = createTestBuilder(tmpDir);
        const domain = "api.example.com";

        const confPath = path.join(tmpDir, FOLDERS.sitesDisabled, `${domain}.conf`);
        fs.writeFileSync(confPath, "# config");

        builder.deleteDomainFiles(domain);

        expect(fs.existsSync(confPath)).toBe(false);
    });

    it("should recursively remove the domain app folder", () => {
        const { builder } = createTestBuilder(tmpDir);
        const domain = "api.example.com";

        // Create app folder with some files.
        const appDir = path.join(tmpDir, FOLDERS.apps, domain);
        fs.mkdirSync(appDir, { recursive: true });
        fs.writeFileSync(path.join(appDir, "upstream.conf"), "# upstream");
        fs.writeFileSync(path.join(appDir, "ssl.conf"), "# ssl");

        builder.deleteDomainFiles(domain);

        expect(fs.existsSync(appDir)).toBe(false);
    });

    it("should not throw when domain files do not exist", () => {
        const { builder } = createTestBuilder(tmpDir);

        // Should not throw even when no files exist for the domain.
        expect(() => {
            builder.deleteDomainFiles("nonexistent.com");
        }).not.toThrow();
    });

    it("should remove both sites-enabled config and app folder together", () => {
        const { builder } = createTestBuilder(tmpDir);
        const domain = "api.example.com";

        // Create both a config file and an app folder.
        fs.writeFileSync(
            path.join(tmpDir, FOLDERS.sitesEnabled, `${domain}.conf`),
            "# config",
        );
        const appDir = path.join(tmpDir, FOLDERS.apps, domain);
        fs.mkdirSync(appDir, { recursive: true });
        fs.writeFileSync(path.join(appDir, "maintenance.html"), "<h1>Down</h1>");

        builder.deleteDomainFiles(domain);

        expect(fs.existsSync(path.join(tmpDir, FOLDERS.sitesEnabled, `${domain}.conf`))).toBe(false);
        expect(fs.existsSync(appDir)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Config Lifecycle
// ---------------------------------------------------------------------------

describe("ProxyBuilder — Config Lifecycle", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-builder-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should create a new config file via initConfig()", () => {
        const { builder } = createTestBuilder(tmpDir);
        const isNew = builder.initConfig("admin@example.com");

        expect(isNew).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, CONFIG_FILENAME))).toBe(true);
    });

    it("should return false when config already exists", () => {
        const { builder } = createTestBuilder(tmpDir);

        builder.initConfig("admin@example.com");
        const isNew = builder.initConfig("admin@example.com");

        expect(isNew).toBe(false);
    });

    it("should load existing config via loadConfig()", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.initConfig("admin@example.com");

        const config = builder.loadConfig();

        expect(config).not.toBeNull();
        expect(config!.email).toBe("admin@example.com");
    });

    it("should return null when no config file exists", () => {
        const { builder } = createTestBuilder(tmpDir);
        const config = builder.loadConfig();

        expect(config).toBeNull();
    });

    it("should expose the ConfigManager via getConfigManager()", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.initConfig("admin@example.com");

        const cm = builder.getConfigManager();
        expect(cm).toBeDefined();
        // ConfigManager should have the domain operations available.
        expect(typeof cm.addDomain).toBe("function");
        expect(typeof cm.listDomains).toBe("function");
    });
});

// ---------------------------------------------------------------------------
// Path Accessors
// ---------------------------------------------------------------------------

describe("ProxyBuilder — Path Accessors", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-builder-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should return the target directory via getTarget()", () => {
        const { builder } = createTestBuilder(tmpDir);
        expect(builder.getTarget()).toBe(tmpDir);
    });

    it("should resolve a path relative to target via resolvePath()", () => {
        const { builder } = createTestBuilder(tmpDir);
        const resolved = builder.resolvePath("nginx", "nginx.conf");

        expect(resolved).toBe(path.join(tmpDir, "nginx", "nginx.conf"));
    });

    it("should return the config file path via getConfigPath()", () => {
        const { builder } = createTestBuilder(tmpDir);
        const configPath = builder.getConfigPath();

        expect(configPath).toBe(path.join(tmpDir, CONFIG_FILENAME));
    });
});

// ---------------------------------------------------------------------------
// Template Rendering — Shared Configs
// ---------------------------------------------------------------------------

describe("ProxyBuilder — renderSharedConfigs", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-builder-test-"));
        const { builder } = createTestBuilder(tmpDir);
        builder.createDirectoryStructure();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should render nginx.conf into the nginx directory", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderSharedConfigs();

        const nginxConf = path.join(tmpDir, FOLDERS.nginx, "nginx.conf");
        expect(fs.existsSync(nginxConf)).toBe(true);

        const content = fs.readFileSync(nginxConf, "utf-8");
        // Should contain core nginx directives from the template.
        expect(content).toContain("worker_processes");
        expect(content.length).toBeGreaterThan(100);
    });

    it("should render proxy.conf into the proxy directory", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderSharedConfigs();

        const proxyConf = path.join(tmpDir, FOLDERS.proxy, "proxy.conf");
        expect(fs.existsSync(proxyConf)).toBe(true);
    });

    it("should render letsencrypt.conf into the proxy directory", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderSharedConfigs();

        const leConf = path.join(tmpDir, FOLDERS.proxy, "letsencrypt.conf");
        expect(fs.existsSync(leConf)).toBe(true);

        const content = fs.readFileSync(leConf, "utf-8");
        // Should contain the letsencrypt folder path.
        expect(content).toContain(FOLDERS.letsencrypt);
    });
});

// ---------------------------------------------------------------------------
// Template Rendering — Domain Configs (Passthrough)
// ---------------------------------------------------------------------------

describe("ProxyBuilder — renderDomainConfigs (passthrough)", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-builder-test-"));
        const { builder } = createTestBuilder(tmpDir);
        builder.createDirectoryStructure();
        builder.createDomainApp("api.example.com");
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should render site.conf into sites-enabled", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderDomainConfigs("api.example.com", "passthrough", ["127.0.0.1:3000"], false);

        const siteConf = path.join(tmpDir, FOLDERS.sitesEnabled, "api.example.com.conf");
        expect(fs.existsSync(siteConf)).toBe(true);
    });

    it("should render upstream.conf into the domain app folder", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderDomainConfigs("api.example.com", "passthrough", ["127.0.0.1:3000"], false);

        const upstreamConf = path.join(tmpDir, FOLDERS.apps, "api.example.com", "upstream.conf");
        expect(fs.existsSync(upstreamConf)).toBe(true);

        // Should contain the upstream server directive.
        const content = fs.readFileSync(upstreamConf, "utf-8");
        expect(content).toContain("127.0.0.1:3000");
    });

    it("should render ssl.conf into the domain app folder", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderDomainConfigs("api.example.com", "passthrough", ["127.0.0.1:3000"], false);

        const sslConf = path.join(tmpDir, FOLDERS.apps, "api.example.com", "ssl.conf");
        expect(fs.existsSync(sslConf)).toBe(true);
    });

    it("should render maintenance.conf into the domain app folder", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderDomainConfigs("api.example.com", "passthrough", ["127.0.0.1:3000"], false);

        const maintenanceConf = path.join(tmpDir, FOLDERS.apps, "api.example.com", "maintenance.conf");
        expect(fs.existsSync(maintenanceConf)).toBe(true);
    });

    it("should include multiple upstreams in the upstream config", () => {
        const { builder } = createTestBuilder(tmpDir);
        const upstreams = ["127.0.0.1:3000", "127.0.0.1:3001", "127.0.0.1:3002"];
        builder.renderDomainConfigs("api.example.com", "passthrough", upstreams, false);

        const content = fs.readFileSync(
            path.join(tmpDir, FOLDERS.apps, "api.example.com", "upstream.conf"),
            "utf-8",
        );
        for (const upstream of upstreams) {
            expect(content).toContain(upstream);
        }
    });

    it("should NOT render full-mode-only configs in passthrough mode", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderDomainConfigs("api.example.com", "passthrough", ["127.0.0.1:3000"], false);

        const appDir = path.join(tmpDir, FOLDERS.apps, "api.example.com");
        // Full-mode files should not exist.
        expect(fs.existsSync(path.join(appDir, "security.conf"))).toBe(false);
        expect(fs.existsSync(path.join(appDir, "general.conf"))).toBe(false);
        expect(fs.existsSync(path.join(appDir, "log.conf"))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Template Rendering — Domain Configs (Full)
// ---------------------------------------------------------------------------

describe("ProxyBuilder — renderDomainConfigs (full)", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-builder-test-"));
        const { builder } = createTestBuilder(tmpDir);
        builder.createDirectoryStructure();
        builder.createDomainApp("app.example.com");
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should render all passthrough-common configs", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderDomainConfigs("app.example.com", "full", ["127.0.0.1:4000"], false);

        const appDir = path.join(tmpDir, FOLDERS.apps, "app.example.com");
        expect(fs.existsSync(path.join(tmpDir, FOLDERS.sitesEnabled, "app.example.com.conf"))).toBe(true);
        expect(fs.existsSync(path.join(appDir, "upstream.conf"))).toBe(true);
        expect(fs.existsSync(path.join(appDir, "ssl.conf"))).toBe(true);
        expect(fs.existsSync(path.join(appDir, "maintenance.conf"))).toBe(true);
    });

    it("should render security.conf in full mode", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderDomainConfigs("app.example.com", "full", ["127.0.0.1:4000"], false);

        const securityConf = path.join(tmpDir, FOLDERS.apps, "app.example.com", "security.conf");
        expect(fs.existsSync(securityConf)).toBe(true);
    });

    it("should render general.conf in full mode", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderDomainConfigs("app.example.com", "full", ["127.0.0.1:4000"], false);

        const generalConf = path.join(tmpDir, FOLDERS.apps, "app.example.com", "general.conf");
        expect(fs.existsSync(generalConf)).toBe(true);
    });

    it("should render log.conf in full mode", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderDomainConfigs("app.example.com", "full", ["127.0.0.1:4000"], false);

        const logConf = path.join(tmpDir, FOLDERS.apps, "app.example.com", "log.conf");
        expect(fs.existsSync(logConf)).toBe(true);

        const content = fs.readFileSync(logConf, "utf-8");
        // Log config should reference the logs directory.
        expect(content).toContain(FOLDERS.logs);
    });
});

// ---------------------------------------------------------------------------
// Template Rendering — Wildcard Domains
// ---------------------------------------------------------------------------

describe("ProxyBuilder — renderDomainConfigs (wildcard)", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-builder-test-"));
        const { builder } = createTestBuilder(tmpDir);
        builder.createDirectoryStructure();
        builder.createDomainApp("*.example.com");
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should render site.conf with wildcard server_name", () => {
        const { builder } = createTestBuilder(tmpDir);
        builder.renderDomainConfigs("*.example.com", "passthrough", ["127.0.0.1:3000"], true);

        const siteConf = path.join(tmpDir, FOLDERS.sitesEnabled, "*.example.com.conf");
        expect(fs.existsSync(siteConf)).toBe(true);

        const content = fs.readFileSync(siteConf, "utf-8");
        // Wildcard domain should appear in the server_name directive.
        expect(content).toContain("*.example.com");
        // The bare domain (example.com) should also be included for wildcard.
        expect(content).toContain("example.com");
    });
});
