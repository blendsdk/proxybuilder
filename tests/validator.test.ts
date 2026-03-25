/**
 * Tests for the Validator class.
 *
 * Covers domain validation, upstream validation, email validation,
 * proxy mode/cert method validation, and pre-flight checks.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { Validator } from "../src/validator";

// ---------------------------------------------------------------------------
// Domain Validation
// ---------------------------------------------------------------------------

describe("Validator.isValidDomain", () => {
    // --- Happy path: standard domains ---

    it("should accept a simple two-level domain", () => {
        expect(Validator.isValidDomain("example.com")).toBe(true);
    });

    it("should accept a three-level subdomain", () => {
        expect(Validator.isValidDomain("api.example.com")).toBe(true);
    });

    it("should accept a deeply nested subdomain", () => {
        expect(Validator.isValidDomain("a.b.c.d.example.com")).toBe(true);
    });

    it("should accept domains with hyphens in labels", () => {
        expect(Validator.isValidDomain("my-api.example-site.com")).toBe(true);
    });

    it("should accept domains with numbers", () => {
        expect(Validator.isValidDomain("api2.example123.com")).toBe(true);
    });

    it("should accept a domain with a long TLD", () => {
        expect(Validator.isValidDomain("example.technology")).toBe(true);
    });

    // --- Happy path: wildcard domains ---

    it("should accept a wildcard domain", () => {
        expect(Validator.isValidDomain("*.example.com")).toBe(true);
    });

    it("should accept a wildcard with subdomain base", () => {
        expect(Validator.isValidDomain("*.sub.example.com")).toBe(true);
    });

    // --- Edge cases: length limits ---

    it("should reject an empty string", () => {
        expect(Validator.isValidDomain("")).toBe(false);
    });

    it("should reject a domain exceeding 253 characters", () => {
        // Build a domain just over 253 characters.
        const longLabel = "a".repeat(50);
        const parts: string[] = [];
        // Each part is 51 chars (label + dot), need ~5 parts to exceed 253.
        for (let i = 0; i < 6; i++) {
            parts.push(longLabel);
        }
        const longDomain = parts.join(".") + ".com";
        expect(longDomain.length).toBeGreaterThan(253);
        expect(Validator.isValidDomain(longDomain)).toBe(false);
    });

    it("should reject a domain with a label exceeding 63 characters", () => {
        const longLabel = "a".repeat(64);
        expect(Validator.isValidDomain(`${longLabel}.com`)).toBe(false);
    });

    it("should accept a domain with a label of exactly 63 characters", () => {
        const maxLabel = "a".repeat(63);
        expect(Validator.isValidDomain(`${maxLabel}.com`)).toBe(true);
    });

    // --- Invalid domains ---

    it("should reject a domain starting with a hyphen", () => {
        expect(Validator.isValidDomain("-example.com")).toBe(false);
    });

    it("should reject a domain ending with a hyphen in a label", () => {
        expect(Validator.isValidDomain("example-.com")).toBe(false);
    });

    it("should reject a domain with spaces", () => {
        expect(Validator.isValidDomain("my domain.com")).toBe(false);
    });

    it("should reject a domain with underscores", () => {
        expect(Validator.isValidDomain("my_domain.com")).toBe(false);
    });

    it("should reject a bare TLD", () => {
        expect(Validator.isValidDomain("com")).toBe(false);
    });

    it("should reject a domain with a single-character TLD", () => {
        expect(Validator.isValidDomain("example.c")).toBe(false);
    });

    it("should reject a domain with consecutive dots", () => {
        expect(Validator.isValidDomain("example..com")).toBe(false);
    });

    it("should reject a domain with a trailing dot", () => {
        // Trailing dot is FQDN notation — not accepted by this validator.
        expect(Validator.isValidDomain("example.com.")).toBe(false);
    });

    it("should reject a domain with a leading dot", () => {
        expect(Validator.isValidDomain(".example.com")).toBe(false);
    });

    it("should reject a numeric TLD", () => {
        expect(Validator.isValidDomain("example.123")).toBe(false);
    });

    // --- Invalid wildcards ---

    it("should reject a multi-level wildcard", () => {
        expect(Validator.isValidDomain("*.*.example.com")).toBe(false);
    });

    it("should reject a wildcard without a base domain", () => {
        expect(Validator.isValidDomain("*.com")).toBe(false);
    });

    it("should reject a wildcard in the middle", () => {
        expect(Validator.isValidDomain("sub.*.example.com")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Wildcard Detection
// ---------------------------------------------------------------------------

describe("Validator.isWildcard", () => {
    it("should detect a wildcard domain", () => {
        expect(Validator.isWildcard("*.example.com")).toBe(true);
    });

    it("should detect a nested wildcard domain", () => {
        expect(Validator.isWildcard("*.sub.example.com")).toBe(true);
    });

    it("should return false for a standard domain", () => {
        expect(Validator.isWildcard("api.example.com")).toBe(false);
    });

    it("should return false for a domain that just contains an asterisk", () => {
        expect(Validator.isWildcard("a*.example.com")).toBe(false);
    });

    it("should return false for an empty string", () => {
        expect(Validator.isWildcard("")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Upstream Validation
// ---------------------------------------------------------------------------

describe("Validator.isValidUpstream", () => {
    // --- Happy path ---

    it("should accept a standard localhost upstream", () => {
        expect(Validator.isValidUpstream("127.0.0.1:3000")).toBe(true);
    });

    it("should accept a hostname upstream", () => {
        expect(Validator.isValidUpstream("backend:8080")).toBe(true);
    });

    it("should accept an upstream with port 1 (minimum)", () => {
        expect(Validator.isValidUpstream("127.0.0.1:1")).toBe(true);
    });

    it("should accept an upstream with port 65535 (maximum)", () => {
        expect(Validator.isValidUpstream("127.0.0.1:65535")).toBe(true);
    });

    it("should accept a dotted hostname upstream", () => {
        expect(Validator.isValidUpstream("app.internal:9000")).toBe(true);
    });

    it("should accept a hyphenated hostname upstream", () => {
        expect(Validator.isValidUpstream("my-backend:3000")).toBe(true);
    });

    // --- Invalid upstreams ---

    it("should reject an upstream without a port", () => {
        expect(Validator.isValidUpstream("127.0.0.1")).toBe(false);
    });

    it("should reject an upstream with port 0", () => {
        expect(Validator.isValidUpstream("127.0.0.1:0")).toBe(false);
    });

    it("should reject an upstream with port exceeding 65535", () => {
        expect(Validator.isValidUpstream("127.0.0.1:65536")).toBe(false);
    });

    it("should reject an upstream with a very high port number", () => {
        expect(Validator.isValidUpstream("127.0.0.1:99999")).toBe(false);
    });

    it("should reject an upstream with no host", () => {
        expect(Validator.isValidUpstream(":3000")).toBe(false);
    });

    it("should reject an empty string", () => {
        expect(Validator.isValidUpstream("")).toBe(false);
    });

    it("should reject an upstream with spaces", () => {
        expect(Validator.isValidUpstream("127.0.0.1: 3000")).toBe(false);
    });

    it("should reject an upstream with a non-numeric port", () => {
        expect(Validator.isValidUpstream("127.0.0.1:abc")).toBe(false);
    });

    it("should reject an upstream with protocol prefix", () => {
        expect(Validator.isValidUpstream("http://127.0.0.1:3000")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Email Validation
// ---------------------------------------------------------------------------

describe("Validator.isValidEmail", () => {
    // --- Happy path ---

    it("should accept a standard email", () => {
        expect(Validator.isValidEmail("user@example.com")).toBe(true);
    });

    it("should accept an email with subdomain", () => {
        expect(Validator.isValidEmail("admin@mail.example.com")).toBe(true);
    });

    it("should accept an email with plus alias", () => {
        expect(Validator.isValidEmail("user+tag@example.com")).toBe(true);
    });

    it("should accept an email with dots in local part", () => {
        expect(Validator.isValidEmail("first.last@example.com")).toBe(true);
    });

    it("should accept an email with hyphens in domain", () => {
        expect(Validator.isValidEmail("user@my-company.com")).toBe(true);
    });

    // --- Invalid emails ---

    it("should reject an email without @", () => {
        expect(Validator.isValidEmail("userexample.com")).toBe(false);
    });

    it("should reject an email without domain", () => {
        expect(Validator.isValidEmail("user@")).toBe(false);
    });

    it("should reject an email without local part", () => {
        expect(Validator.isValidEmail("@example.com")).toBe(false);
    });

    it("should reject an email without dot in domain", () => {
        expect(Validator.isValidEmail("user@example")).toBe(false);
    });

    it("should reject an email with spaces", () => {
        expect(Validator.isValidEmail("user @example.com")).toBe(false);
    });

    it("should reject an empty string", () => {
        expect(Validator.isValidEmail("")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Root Detection
// ---------------------------------------------------------------------------

describe("Validator.isRoot", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should return true when UID is 0", () => {
        // Mock process.getuid to return 0 (root).
        vi.spyOn(process, "getuid").mockReturnValue(0);
        expect(Validator.isRoot()).toBe(true);
    });

    it("should return false when UID is non-zero", () => {
        vi.spyOn(process, "getuid").mockReturnValue(1000);
        expect(Validator.isRoot()).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Command Exists
// ---------------------------------------------------------------------------

describe("Validator.commandExists", () => {
    it("should return true for a known system command (node)", () => {
        // 'node' is guaranteed to exist since we're running in Node.
        expect(Validator.commandExists("node")).toBe(true);
    });

    it("should return false for a non-existent command", () => {
        expect(Validator.commandExists("definitely_not_a_real_command_xyz_123")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Proxy Mode Validation
// ---------------------------------------------------------------------------

describe("Validator.isValidProxyMode", () => {
    it('should accept "passthrough"', () => {
        expect(Validator.isValidProxyMode("passthrough")).toBe(true);
    });

    it('should accept "full"', () => {
        expect(Validator.isValidProxyMode("full")).toBe(true);
    });

    it("should reject an unknown mode", () => {
        expect(Validator.isValidProxyMode("minimal")).toBe(false);
    });

    it("should reject an empty string", () => {
        expect(Validator.isValidProxyMode("")).toBe(false);
    });

    it("should be case-sensitive (reject uppercase)", () => {
        expect(Validator.isValidProxyMode("Full")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Cert Method Validation
// ---------------------------------------------------------------------------

describe("Validator.isValidCertMethod", () => {
    it('should accept "webroot"', () => {
        expect(Validator.isValidCertMethod("webroot")).toBe(true);
    });

    it('should accept "dns"', () => {
        expect(Validator.isValidCertMethod("dns")).toBe(true);
    });

    it("should reject an unknown method", () => {
        expect(Validator.isValidCertMethod("manual")).toBe(false);
    });

    it("should reject an empty string", () => {
        expect(Validator.isValidCertMethod("")).toBe(false);
    });

    it("should be case-sensitive (reject uppercase)", () => {
        expect(Validator.isValidCertMethod("DNS")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Pre-flight Check
// ---------------------------------------------------------------------------

describe("Validator.preflightCheck", () => {
    it("should return ok:true when all binaries exist", () => {
        // 'node' is always available in our test environment.
        const result = Validator.preflightCheck(["node"]);
        expect(result.ok).toBe(true);
        expect(result.missing).toEqual([]);
    });

    it("should return ok:false and list missing binaries", () => {
        const result = Validator.preflightCheck(["node", "nonexistent_tool_xyz"]);
        expect(result.ok).toBe(false);
        expect(result.missing).toEqual(["nonexistent_tool_xyz"]);
    });

    it("should handle all binaries missing", () => {
        const result = Validator.preflightCheck(["fake_binary_a", "fake_binary_b"]);
        expect(result.ok).toBe(false);
        expect(result.missing).toEqual(["fake_binary_a", "fake_binary_b"]);
    });

    it("should return ok:true for an empty requirements list", () => {
        const result = Validator.preflightCheck([]);
        expect(result.ok).toBe(true);
        expect(result.missing).toEqual([]);
    });
});
