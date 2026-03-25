/**
 * Tests for application-wide constants.
 *
 * Validates that all exported constants have expected values and types.
 * These tests prevent accidental modification of critical configuration
 * values that could break nginx configs or certbot operations.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from "vitest";

import {
    DEFAULT_TARGET,
    CONFIG_FILENAME,
    CONFIG_VERSION,
    MAINTENANCE_FLAG,
    CERTBOT_BIN,
    NGINX_BIN,
    DEFAULT_EMAIL,
    DEFAULT_PROXY,
    DEFAULT_LOG_LEVEL,
    DH_PARAM_BITS,
    LE_STAGING_NOTE,
    CRON_SCHEDULE,
    FOLDERS,
} from "../src/constants";
import { LogLevel } from "../src/types";

// ---------------------------------------------------------------------------
// Paths & Filenames
// ---------------------------------------------------------------------------

describe("Constants — Paths & Filenames", () => {
    it("should define DEFAULT_TARGET as /opt/proxybuilder", () => {
        expect(DEFAULT_TARGET).toBe("/opt/proxybuilder");
    });

    it("should define CONFIG_FILENAME as proxybuilder.json", () => {
        expect(CONFIG_FILENAME).toBe("proxybuilder.json");
    });

    it("should define CONFIG_VERSION as '2.0'", () => {
        expect(CONFIG_VERSION).toBe("2.0");
    });

    it("should define MAINTENANCE_FLAG as maintenance.flag", () => {
        expect(MAINTENANCE_FLAG).toBe("maintenance.flag");
    });
});

// ---------------------------------------------------------------------------
// External Binaries
// ---------------------------------------------------------------------------

describe("Constants — External Binaries", () => {
    it("should define CERTBOT_BIN as 'certbot'", () => {
        expect(CERTBOT_BIN).toBe("certbot");
    });

    it("should define NGINX_BIN as 'nginx'", () => {
        expect(NGINX_BIN).toBe("nginx");
    });
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe("Constants — Defaults", () => {
    it("should define DEFAULT_EMAIL as empty string", () => {
        expect(DEFAULT_EMAIL).toBe("");
    });

    it("should define DEFAULT_PROXY with passthrough mode", () => {
        expect(DEFAULT_PROXY.proxyMode).toBe("passthrough");
    });

    it("should define DEFAULT_PROXY with webroot cert method", () => {
        expect(DEFAULT_PROXY.certMethod).toBe("webroot");
    });

    it("should define DEFAULT_LOG_LEVEL as INFO", () => {
        expect(DEFAULT_LOG_LEVEL).toBe(LogLevel.INFO);
    });

    it("should define DH_PARAM_BITS as 2048", () => {
        expect(DH_PARAM_BITS).toBe(2048);
    });
});

// ---------------------------------------------------------------------------
// SSL & Cron
// ---------------------------------------------------------------------------

describe("Constants — SSL & Cron", () => {
    it("should define LE_STAGING_NOTE as a non-empty string", () => {
        expect(LE_STAGING_NOTE.length).toBeGreaterThan(0);
        expect(LE_STAGING_NOTE).toContain("STAGING");
    });

    it("should define CRON_SCHEDULE as a valid 5-field cron expression", () => {
        // 5 space-separated fields: minute hour dom month dow
        const fields = CRON_SCHEDULE.split(" ");
        expect(fields).toHaveLength(5);
    });

    it("should schedule cron at 3 AM daily", () => {
        expect(CRON_SCHEDULE).toBe("0 3 * * *");
    });
});

// ---------------------------------------------------------------------------
// Folder Layout
// ---------------------------------------------------------------------------

describe("Constants — FOLDERS", () => {
    it("should define all required folder names", () => {
        expect(FOLDERS.nginx).toBe("nginx");
        expect(FOLDERS.proxy).toBe("proxy");
        expect(FOLDERS.ssl).toBe("ssl");
        expect(FOLDERS.apps).toBe("apps");
        expect(FOLDERS.logs).toBe("logs");
        expect(FOLDERS.dns).toBe("dns");
        expect(FOLDERS.letsencrypt).toBe("letsencrypt");
    });

    it("should define nested nginx directories", () => {
        expect(FOLDERS.sitesEnabled).toBe("nginx/sites-enabled");
        expect(FOLDERS.sitesDisabled).toBe("nginx/sites-disabled");
        expect(FOLDERS.modulesEnabled).toBe("nginx/modules-enabled");
        expect(FOLDERS.confD).toBe("nginx/conf.d");
    });

    it("should have exactly 11 folder entries", () => {
        expect(Object.keys(FOLDERS)).toHaveLength(11);
    });
});
