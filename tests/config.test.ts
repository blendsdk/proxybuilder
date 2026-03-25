/**
 * Tests for the ConfigManager class.
 *
 * Uses a real temporary directory for file I/O — no mocks needed.
 * Tests cover config creation, loading, saving, domain CRUD,
 * DNS credential management, and error handling.
 *
 * @packageDocumentation
 */

import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { ConfigManager } from "../src/config";
import { Logger } from "../src/logger";
import { IDomainConfig, LogLevel } from "../src/types";
import { CONFIG_FILENAME, CONFIG_VERSION, DEFAULT_PROXY } from "../src/constants";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Create a Logger with QUIET level so tests produce no console output. */
function createQuietLogger(): Logger {
    return new Logger(LogLevel.QUIET);
}

/**
 * Build a complete IDomainConfig for testing.
 * All fields are explicitly provided to satisfy the interface.
 */
function createTestDomainConfig(overrides: Partial<IDomainConfig> = {}): IDomainConfig {
    return {
        proxyMode: "passthrough",
        upstreams: ["127.0.0.1:3000"],
        certMethod: "webroot",
        enabled: true,
        maintenance: false,
        wildcard: false,
        staging: false,
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// File Operations
// ---------------------------------------------------------------------------

describe("ConfigManager — File Operations", () => {
    let tmpDir: string;
    let logger: Logger;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-config-test-"));
        logger = createQuietLogger();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should report that config does not exist before creation", () => {
        const cm = new ConfigManager(tmpDir, logger);
        expect(cm.exists()).toBe(false);
    });

    it("should create a new config file with correct structure", () => {
        const cm = new ConfigManager(tmpDir, logger);
        cm.create("admin@example.com");

        // File should now exist.
        expect(cm.exists()).toBe(true);

        // Verify the file is valid JSON with expected structure.
        const raw = fs.readFileSync(path.join(tmpDir, CONFIG_FILENAME), "utf-8");
        const parsed = JSON.parse(raw);
        expect(parsed.version).toBe(CONFIG_VERSION);
        expect(parsed.email).toBe("admin@example.com");
        expect(parsed.domains).toEqual({});
        expect(parsed.dns).toEqual({});
        expect(parsed.defaults.proxyMode).toBe(DEFAULT_PROXY.proxyMode);
        expect(parsed.defaults.certMethod).toBe(DEFAULT_PROXY.certMethod);
    });

    it("should set restrictive file permissions (0600)", () => {
        const cm = new ConfigManager(tmpDir, logger);
        cm.create("admin@example.com");

        const stats = fs.statSync(path.join(tmpDir, CONFIG_FILENAME));
        // File permissions — owner read/write only (0o600 = 384 decimal).
        const mode = stats.mode & 0o777;
        expect(mode).toBe(0o600);
    });

    it("should load an existing config file", () => {
        const cm = new ConfigManager(tmpDir, logger);
        cm.create("admin@example.com");

        // Create a fresh instance and load.
        const cm2 = new ConfigManager(tmpDir, logger);
        const loaded = cm2.load();
        expect(loaded).toBe(true);

        const config = cm2.getConfig();
        expect(config.email).toBe("admin@example.com");
        expect(config.version).toBe(CONFIG_VERSION);
    });

    it("should return false when loading a non-existent config", () => {
        const cm = new ConfigManager(tmpDir, logger);
        const loaded = cm.load();
        expect(loaded).toBe(false);
    });

    it("should throw on corrupt JSON", () => {
        // Write invalid JSON to the config file.
        fs.writeFileSync(path.join(tmpDir, CONFIG_FILENAME), "not json {{{", { mode: 0o600 });

        const cm = new ConfigManager(tmpDir, logger);
        expect(() => cm.load()).toThrow(/invalid JSON/);
    });

    it("should persist changes via save()", () => {
        const cm = new ConfigManager(tmpDir, logger);
        cm.create("admin@example.com");
        cm.addDomain("api.example.com", createTestDomainConfig());

        // Read back from a fresh instance.
        const cm2 = new ConfigManager(tmpDir, logger);
        cm2.load();
        expect(cm2.getDomain("api.example.com")).toBeDefined();
    });

    it("should expose the target folder via getTargetFolder()", () => {
        const cm = new ConfigManager(tmpDir, logger);
        cm.create("admin@example.com");
        cm.load();
        expect(cm.getTargetFolder()).toBe(tmpDir);
    });

    it("should expose the email via getEmail()", () => {
        const cm = new ConfigManager(tmpDir, logger);
        cm.create("admin@example.com");
        cm.load();
        expect(cm.getEmail()).toBe("admin@example.com");
    });
});

// ---------------------------------------------------------------------------
// Domain CRUD
// ---------------------------------------------------------------------------

describe("ConfigManager — Domain CRUD", () => {
    let tmpDir: string;
    let logger: Logger;
    let cm: ConfigManager;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-config-test-"));
        logger = createQuietLogger();
        cm = new ConfigManager(tmpDir, logger);
        cm.create("admin@example.com");
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // --- Add Domain ---

    it("should add a new domain", () => {
        const config = createTestDomainConfig();
        cm.addDomain("api.example.com", config);

        const domain = cm.getDomain("api.example.com");
        expect(domain).toBeDefined();
        expect(domain!.proxyMode).toBe("passthrough");
        expect(domain!.upstreams).toEqual(["127.0.0.1:3000"]);
    });

    it("should throw when adding a duplicate domain", () => {
        cm.addDomain("api.example.com", createTestDomainConfig());

        expect(() => {
            cm.addDomain("api.example.com", createTestDomainConfig());
        }).toThrow(/already exists/);
    });

    it("should persist the domain to disk after adding", () => {
        cm.addDomain("api.example.com", createTestDomainConfig());

        // Verify by loading from disk.
        const cm2 = new ConfigManager(tmpDir, logger);
        cm2.load();
        expect(cm2.getDomain("api.example.com")).toBeDefined();
    });

    // --- Get Domain ---

    it("should return undefined for a non-existent domain", () => {
        expect(cm.getDomain("nonexistent.com")).toBeUndefined();
    });

    // --- Update Domain ---

    it("should update an existing domain with partial changes", () => {
        cm.addDomain("api.example.com", createTestDomainConfig());

        cm.updateDomain("api.example.com", {
            upstreams: ["127.0.0.1:4000", "127.0.0.1:4001"],
            proxyMode: "full",
        });

        const updated = cm.getDomain("api.example.com");
        expect(updated!.upstreams).toEqual(["127.0.0.1:4000", "127.0.0.1:4001"]);
        expect(updated!.proxyMode).toBe("full");
        // Other fields should remain unchanged.
        expect(updated!.certMethod).toBe("webroot");
        expect(updated!.enabled).toBe(true);
    });

    it("should auto-update the 'updated' timestamp on update", () => {
        const originalDate = "2026-01-01T00:00:00.000Z";
        cm.addDomain("api.example.com", createTestDomainConfig({ updated: originalDate }));

        cm.updateDomain("api.example.com", { maintenance: true });

        const updated = cm.getDomain("api.example.com");
        // The updated timestamp should be different from the original.
        expect(updated!.updated).not.toBe(originalDate);
    });

    it("should throw when updating a non-existent domain", () => {
        expect(() => {
            cm.updateDomain("nonexistent.com", { enabled: false });
        }).toThrow(/not found/);
    });

    // --- Remove Domain ---

    it("should remove an existing domain", () => {
        cm.addDomain("api.example.com", createTestDomainConfig());
        cm.removeDomain("api.example.com");

        expect(cm.getDomain("api.example.com")).toBeUndefined();
        expect(cm.domainExists("api.example.com")).toBe(false);
    });

    it("should throw when removing a non-existent domain", () => {
        expect(() => {
            cm.removeDomain("nonexistent.com");
        }).toThrow(/not found/);
    });

    it("should persist removal to disk", () => {
        cm.addDomain("api.example.com", createTestDomainConfig());
        cm.removeDomain("api.example.com");

        const cm2 = new ConfigManager(tmpDir, logger);
        cm2.load();
        expect(cm2.getDomain("api.example.com")).toBeUndefined();
    });

    // --- List Domains ---

    it("should return an empty list when no domains exist", () => {
        expect(cm.listDomains()).toEqual([]);
    });

    it("should list all domains sorted alphabetically", () => {
        cm.addDomain("zoo.example.com", createTestDomainConfig());
        cm.addDomain("api.example.com", createTestDomainConfig());
        cm.addDomain("mail.example.com", createTestDomainConfig());

        const list = cm.listDomains();
        expect(list).toHaveLength(3);
        expect(list[0].domain).toBe("api.example.com");
        expect(list[1].domain).toBe("mail.example.com");
        expect(list[2].domain).toBe("zoo.example.com");
    });

    it("should include config data in the list", () => {
        cm.addDomain("api.example.com", createTestDomainConfig({ proxyMode: "full" }));

        const list = cm.listDomains();
        expect(list[0].config.proxyMode).toBe("full");
    });

    // --- Domain Exists ---

    it("should return true for an existing domain", () => {
        cm.addDomain("api.example.com", createTestDomainConfig());
        expect(cm.domainExists("api.example.com")).toBe(true);
    });

    it("should return false for a non-existent domain", () => {
        expect(cm.domainExists("nonexistent.com")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// DNS Credentials
// ---------------------------------------------------------------------------

describe("ConfigManager — DNS Credentials", () => {
    let tmpDir: string;
    let logger: Logger;
    let cm: ConfigManager;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-config-test-"));
        logger = createQuietLogger();
        cm = new ConfigManager(tmpDir, logger);
        cm.create("admin@example.com");
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should return undefined for unconfigured provider credentials", () => {
        expect(cm.getDnsCredentials("cloudns")).toBeUndefined();
    });

    it("should store and retrieve DNS credentials", () => {
        cm.setDnsCredentials("cloudns", {
            provider: "cloudns",
            authId: "12345",
            authPassword: "secret",
        });

        const creds = cm.getDnsCredentials("cloudns");
        expect(creds).toBeDefined();
        expect(creds!.provider).toBe("cloudns");
        expect(creds!.authId).toBe("12345");
        expect(creds!.authPassword).toBe("secret");
    });

    it("should overwrite existing credentials for the same provider", () => {
        cm.setDnsCredentials("cloudns", {
            provider: "cloudns",
            authId: "old-id",
            authPassword: "old-pass",
        });

        cm.setDnsCredentials("cloudns", {
            provider: "cloudns",
            authId: "new-id",
            authPassword: "new-pass",
        });

        const creds = cm.getDnsCredentials("cloudns");
        expect(creds!.authId).toBe("new-id");
    });

    it("should persist credentials to disk", () => {
        cm.setDnsCredentials("namecheap", {
            provider: "namecheap",
            apiUser: "user",
            apiKey: "key123",
            clientIp: "1.2.3.4",
        });

        const cm2 = new ConfigManager(tmpDir, logger);
        cm2.load();
        const creds = cm2.getDnsCredentials("namecheap");
        expect(creds).toBeDefined();
        expect(creds!.apiUser).toBe("user");
    });

    it("should store credentials for multiple providers independently", () => {
        cm.setDnsCredentials("cloudns", {
            provider: "cloudns",
            authId: "12345",
            authPassword: "secret",
        });

        cm.setDnsCredentials("namecheap", {
            provider: "namecheap",
            apiUser: "user",
            apiKey: "key",
            clientIp: "1.2.3.4",
        });

        expect(cm.getDnsCredentials("cloudns")).toBeDefined();
        expect(cm.getDnsCredentials("namecheap")).toBeDefined();
        expect(cm.getDnsCredentials("cloudns")!.authId).toBe("12345");
        expect(cm.getDnsCredentials("namecheap")!.apiUser).toBe("user");
    });
});

// ---------------------------------------------------------------------------
// Config Snapshot
// ---------------------------------------------------------------------------

describe("ConfigManager — getConfig snapshot", () => {
    let tmpDir: string;
    let logger: Logger;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-config-test-"));
        logger = createQuietLogger();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should return a config with all expected top-level fields", () => {
        const cm = new ConfigManager(tmpDir, logger);
        cm.create("admin@example.com");

        const config = cm.getConfig();
        expect(config).toHaveProperty("version");
        expect(config).toHaveProperty("email");
        expect(config).toHaveProperty("targetFolder");
        expect(config).toHaveProperty("defaults");
        expect(config).toHaveProperty("domains");
        expect(config).toHaveProperty("dns");
    });

    it("should reflect mutations via domain operations", () => {
        const cm = new ConfigManager(tmpDir, logger);
        cm.create("admin@example.com");

        cm.addDomain("api.example.com", createTestDomainConfig());
        const config = cm.getConfig();
        expect(Object.keys(config.domains)).toContain("api.example.com");
    });
});
