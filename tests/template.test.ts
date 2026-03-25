/**
 * Tests for the template engine module.
 *
 * Covers the pure helper functions (generateUpstreamServers,
 * generateUpstreamName, generateServerName) and the file-based
 * renderTemplate function using real template files in a temp directory.
 *
 * @packageDocumentation
 */

import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
    renderTemplate,
    generateUpstreamServers,
    generateUpstreamName,
    generateServerName,
} from "../src/template";
import { Logger } from "../src/logger";
import { LogLevel } from "../src/types";

// ---------------------------------------------------------------------------
// generateUpstreamServers
// ---------------------------------------------------------------------------

describe("generateUpstreamServers", () => {
    it("should format a single upstream as an indented server directive", () => {
        const result = generateUpstreamServers(["127.0.0.1:3000"]);
        expect(result).toBe("    server 127.0.0.1:3000;");
    });

    it("should format multiple upstreams as multi-line server directives", () => {
        const result = generateUpstreamServers(["127.0.0.1:3000", "127.0.0.1:3001"]);
        expect(result).toBe(
            "    server 127.0.0.1:3000;\n" +
            "    server 127.0.0.1:3001;"
        );
    });

    it("should handle three or more upstreams for round-robin", () => {
        const result = generateUpstreamServers([
            "10.0.0.1:8080",
            "10.0.0.2:8080",
            "10.0.0.3:8080",
        ]);
        const lines = result.split("\n");
        expect(lines).toHaveLength(3);
        // Each line should be properly indented with 4 spaces.
        lines.forEach((line) => {
            expect(line).toMatch(/^ {4}server .+;$/);
        });
    });

    it("should return an empty string for an empty array", () => {
        const result = generateUpstreamServers([]);
        expect(result).toBe("");
    });

    it("should preserve the exact upstream address", () => {
        const result = generateUpstreamServers(["my-backend.local:9090"]);
        expect(result).toContain("my-backend.local:9090");
    });
});

// ---------------------------------------------------------------------------
// generateUpstreamName
// ---------------------------------------------------------------------------

describe("generateUpstreamName", () => {
    it("should prefix the name with 'backend_'", () => {
        const result = generateUpstreamName("example.com");
        expect(result).toMatch(/^backend_/);
    });

    it("should replace dots with underscores", () => {
        const result = generateUpstreamName("api.example.com");
        expect(result).toBe("backend_api_example_com");
    });

    it("should replace wildcard asterisk with underscore", () => {
        const result = generateUpstreamName("*.example.com");
        expect(result).toBe("backend___example_com");
    });

    it("should handle a simple two-part domain", () => {
        const result = generateUpstreamName("example.com");
        expect(result).toBe("backend_example_com");
    });

    it("should replace all non-alphanumeric characters", () => {
        // Hyphens and other special chars become underscores.
        const result = generateUpstreamName("my-api.example.com");
        expect(result).toBe("backend_my_api_example_com");
    });
});

// ---------------------------------------------------------------------------
// generateServerName
// ---------------------------------------------------------------------------

describe("generateServerName", () => {
    it("should return the domain as-is for non-wildcard domains", () => {
        const result = generateServerName("api.example.com", false);
        expect(result).toBe("api.example.com");
    });

    it("should return wildcard + bare domain for wildcard domains", () => {
        const result = generateServerName("*.example.com", true);
        expect(result).toBe("*.example.com example.com");
    });

    it("should handle a nested wildcard domain", () => {
        const result = generateServerName("*.sub.example.com", true);
        expect(result).toBe("*.sub.example.com sub.example.com");
    });

    it("should not add the bare domain when wildcard=false even if domain starts with *.", () => {
        // If the caller says wildcard=false, just return the raw string.
        const result = generateServerName("*.example.com", false);
        expect(result).toBe("*.example.com");
    });
});

// ---------------------------------------------------------------------------
// renderTemplate
// ---------------------------------------------------------------------------

describe("renderTemplate", () => {
    /** Temp directory that simulates the dist/ directory with templates. */
    let tmpDir: string;

    /** Logger instance with QUIET level to suppress output in tests. */
    let logger: Logger;

    /**
     * Original __dirname value — renderTemplate resolves templates relative
     * to __dirname, so we must create our templates in the right place.
     * Instead, we'll write templates into the real dist/templates/ and
     * render to a temp output directory.
     */
    let outputDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-test-"));
        outputDir = path.join(tmpDir, "output");
        fs.mkdirSync(outputDir, { recursive: true });
        logger = new Logger(LogLevel.QUIET);
    });

    afterEach(() => {
        // Clean up temp directory.
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should render a template with all placeholders replaced", () => {
        // Use the real maintenance.conf template — it has simple placeholders.
        const outFile = path.join(outputDir, "maintenance.conf");

        renderTemplate(
            "maintenance.conf",
            {
                appFolder: "/opt/proxybuilder/apps",
                domain: "example.com",
                wwwFolder: "/opt/proxybuilder/letsencrypt",
            },
            outFile,
            logger,
        );

        // Verify the output file was created.
        expect(fs.existsSync(outFile)).toBe(true);

        const content = fs.readFileSync(outFile, "utf-8");

        // The rendered file should contain our substituted values.
        expect(content).toContain("/opt/proxybuilder/apps");
        expect(content).toContain("example.com");
        expect(content).toContain("/opt/proxybuilder/letsencrypt");

        // No unreplaced placeholders should remain.
        const unreplaced = content.match(/%[a-zA-Z_]+%/g);
        expect(unreplaced).toBeNull();
    });

    it("should render passthrough/upstream.conf with multiple servers", () => {
        const outFile = path.join(outputDir, "upstream.conf");

        renderTemplate(
            "passthrough/upstream.conf",
            {
                upstreamName: "backend_api_example_com",
                upstreamServers: generateUpstreamServers(["127.0.0.1:3000", "127.0.0.1:3001"]),
            },
            outFile,
            logger,
        );

        const content = fs.readFileSync(outFile, "utf-8");

        // Should contain the upstream block name.
        expect(content).toContain("backend_api_example_com");
        // Should contain both server entries.
        expect(content).toContain("server 127.0.0.1:3000;");
        expect(content).toContain("server 127.0.0.1:3001;");
    });

    it("should render passthrough/site.conf with correct server_name", () => {
        const outFile = path.join(outputDir, "site.conf");

        renderTemplate(
            "passthrough/site.conf",
            {
                domain: "api.example.com",
                serverName: generateServerName("api.example.com", false),
                upstreamName: generateUpstreamName("api.example.com"),
                appFolder: "/opt/proxybuilder/apps",
                proxyFolder: "/opt/proxybuilder/proxy",
                sslFolder: "/opt/proxybuilder/letsencrypt",
                wwwFolder: "/opt/proxybuilder/letsencrypt",
            },
            outFile,
            logger,
        );

        const content = fs.readFileSync(outFile, "utf-8");
        expect(content).toContain("api.example.com");
        expect(content).toContain("backend_api_example_com");
    });

    it("should render passthrough/ssl.conf with correct SSL paths", () => {
        const outFile = path.join(outputDir, "ssl.conf");

        renderTemplate(
            "passthrough/ssl.conf",
            {
                domain: "api.example.com",
                sslFolder: "/opt/proxybuilder/letsencrypt",
            },
            outFile,
            logger,
        );

        const content = fs.readFileSync(outFile, "utf-8");
        expect(content).toContain("/opt/proxybuilder/letsencrypt");
        expect(content).toContain("api.example.com");
    });

    it("should render full/site.conf with all full-mode placeholders", () => {
        const outFile = path.join(outputDir, "full-site.conf");

        renderTemplate(
            "full/site.conf",
            {
                domain: "app.example.com",
                serverName: "app.example.com",
                upstreamName: "backend_app_example_com",
                appFolder: "/opt/proxybuilder/apps",
                proxyFolder: "/opt/proxybuilder/proxy",
                sslFolder: "/opt/proxybuilder/letsencrypt",
                wwwFolder: "/opt/proxybuilder/letsencrypt",
            },
            outFile,
            logger,
        );

        const content = fs.readFileSync(outFile, "utf-8");
        expect(content).toContain("app.example.com");
        expect(content).toContain("backend_app_example_com");
    });

    it("should render full/security.conf", () => {
        const outFile = path.join(outputDir, "security.conf");

        renderTemplate("full/security.conf", {}, outFile, logger);

        const content = fs.readFileSync(outFile, "utf-8");
        // Security config should contain security-related headers.
        expect(content.length).toBeGreaterThan(0);
    });

    it("should render full/log.conf with log paths", () => {
        const outFile = path.join(outputDir, "log.conf");

        renderTemplate(
            "full/log.conf",
            {
                domain: "app.example.com",
                logFolder: "/opt/proxybuilder/logs",
            },
            outFile,
            logger,
        );

        const content = fs.readFileSync(outFile, "utf-8");
        expect(content).toContain("app.example.com");
        expect(content).toContain("/opt/proxybuilder/logs");
    });

    it("should render letsencrypt.conf with webroot path", () => {
        const outFile = path.join(outputDir, "letsencrypt.conf");

        renderTemplate(
            "letsencrypt.conf",
            { wwwFolder: "/opt/proxybuilder/letsencrypt" },
            outFile,
            logger,
        );

        const content = fs.readFileSync(outFile, "utf-8");
        expect(content).toContain("/opt/proxybuilder/letsencrypt");
    });

    it("should create output directories recursively", () => {
        // Output to a deeply nested path that doesn't exist yet.
        const deepOutFile = path.join(outputDir, "deep", "nested", "dir", "test.conf");

        renderTemplate(
            "maintenance.conf",
            {
                appFolder: "/opt/proxybuilder/apps",
                domain: "example.com",
            },
            deepOutFile,
            logger,
        );

        expect(fs.existsSync(deepOutFile)).toBe(true);
    });

    it("should throw when the template file does not exist", () => {
        const outFile = path.join(outputDir, "missing.conf");

        expect(() => {
            renderTemplate("nonexistent/missing.conf", {}, outFile, logger);
        }).toThrow(/Template not found/);
    });

    it("should warn about unreplaced placeholders but still write the file", () => {
        const warnSpy = vi.spyOn(logger, "warn");
        const outFile = path.join(outputDir, "partial.conf");

        // Render maintenance.conf but only provide one of the two placeholders.
        // This should leave %domain% unreplaced and trigger a warning.
        renderTemplate(
            "maintenance.conf",
            { appFolder: "/opt/proxybuilder/apps" },
            outFile,
            logger,
        );

        // File should still be written.
        expect(fs.existsSync(outFile)).toBe(true);

        // Logger.warn should have been called about unreplaced placeholders.
        expect(warnSpy).toHaveBeenCalled();
        const warnCall = warnSpy.mock.calls[0][0];
        expect(warnCall).toContain("unreplaced placeholders");
    });

    it("should render wildcard domain correctly in server_name", () => {
        const outFile = path.join(outputDir, "wildcard-site.conf");

        renderTemplate(
            "passthrough/site.conf",
            {
                domain: "*.example.com",
                // Wildcard server_name includes both the wildcard and bare domain.
                serverName: generateServerName("*.example.com", true),
                upstreamName: generateUpstreamName("*.example.com"),
                appFolder: "/opt/proxybuilder/apps",
                proxyFolder: "/opt/proxybuilder/proxy",
                sslFolder: "/opt/proxybuilder/letsencrypt",
                wwwFolder: "/opt/proxybuilder/letsencrypt",
            },
            outFile,
            logger,
        );

        const content = fs.readFileSync(outFile, "utf-8");
        // Should contain both the wildcard and bare domain in server_name.
        expect(content).toContain("*.example.com example.com");
    });
});
