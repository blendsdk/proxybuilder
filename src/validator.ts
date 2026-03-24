/**
 * Input validation utilities for the proxybuilder CLI.
 *
 * All user-facing input (domain names, upstream addresses, email, etc.)
 * is validated through this module before any work is performed.
 * Validation happens early so errors are reported immediately with
 * clear messages rather than failing deep inside certbot or nginx.
 *
 * All methods are static — no instance state is needed.
 *
 * @packageDocumentation
 */

import { execSync } from "child_process";
import { CertMethod, ProxyMode } from "./types";

// ---------------------------------------------------------------------------
// Regex Patterns
// ---------------------------------------------------------------------------

/**
 * Standard domain name pattern.
 *
 * Allows labels of 1-63 chars (alphanumeric + hyphens, no leading/trailing hyphen)
 * separated by dots, ending with a TLD of at least 2 letters.
 */
const DOMAIN_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/**
 * Wildcard domain pattern — a standard domain prefixed with `*.`.
 *
 * Only single-level wildcards are supported (e.g. `*.example.com`),
 * not multi-level (e.g. `*.*.example.com`).
 */
const WILDCARD_DOMAIN_REGEX = /^\*\.([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/**
 * Upstream address pattern — `host:port` where host is an IPv4 address
 * or a hostname, and port is a number.
 */
const UPSTREAM_REGEX = /^([a-zA-Z0-9._-]+):(\d+)$/;

/**
 * Basic email pattern — not RFC-5322 compliant, but good enough
 * for a Let's Encrypt contact address.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum length of a fully-qualified domain name. */
const MAX_DOMAIN_LENGTH = 253;

/** Maximum length of a single DNS label. */
const MAX_LABEL_LENGTH = 63;

/** Minimum valid port number (inclusive). */
const MIN_PORT = 1;

/** Maximum valid port number (inclusive). */
const MAX_PORT = 65535;

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Static validation utilities for CLI inputs.
 *
 * Usage:
 * ```ts
 * if (!Validator.isValidDomain("api.example.com")) {
 *     logger.error("Invalid domain name");
 * }
 * ```
 */
export class Validator {
    /**
     * Check whether a string is a valid domain name.
     *
     * Accepts both standard domains (`api.example.com`) and wildcard
     * domains (`*.example.com`). Enforces max-length constraints on
     * both the full name and individual labels.
     *
     * @param domain - The domain string to validate.
     * @returns true if the domain is syntactically valid.
     */
    static isValidDomain(domain: string): boolean {
        if (!domain || domain.length > MAX_DOMAIN_LENGTH) {
            return false;
        }

        // Check individual label lengths (split on dots, skip wildcard prefix).
        const labels = domain.replace(/^\*\./, "").split(".");
        if (labels.some((label) => label.length === 0 || label.length > MAX_LABEL_LENGTH)) {
            return false;
        }

        // Match against standard or wildcard pattern.
        return DOMAIN_REGEX.test(domain) || WILDCARD_DOMAIN_REGEX.test(domain);
    }

    /**
     * Check whether a domain is a wildcard domain (e.g. `*.example.com`).
     *
     * @param domain - The domain string to check.
     * @returns true if the domain starts with `*.`.
     */
    static isWildcard(domain: string): boolean {
        return WILDCARD_DOMAIN_REGEX.test(domain);
    }

    /**
     * Validate an upstream server address.
     *
     * An upstream must be in `host:port` format where the port is
     * between 1 and 65535.
     *
     * @param upstream - The upstream string (e.g. "127.0.0.1:3000").
     * @returns true if the upstream is valid.
     */
    static isValidUpstream(upstream: string): boolean {
        const match = UPSTREAM_REGEX.exec(upstream);
        if (!match) {
            return false;
        }

        const port = parseInt(match[2], 10);
        return port >= MIN_PORT && port <= MAX_PORT;
    }

    /**
     * Validate an email address (basic check).
     *
     * This is intentionally lenient — it only checks for the presence
     * of `@` and a dot in the domain part. Detailed RFC validation is
     * unnecessary for a Let's Encrypt contact email.
     *
     * @param email - The email string to validate.
     * @returns true if the email looks valid.
     */
    static isValidEmail(email: string): boolean {
        return EMAIL_REGEX.test(email);
    }

    /**
     * Check whether the current process is running as root (UID 0).
     *
     * Many proxybuilder operations require root access (writing to
     * /etc/nginx, running certbot, etc.).
     *
     * @returns true if the effective UID is 0.
     */
    static isRoot(): boolean {
        return process.getuid?.() === 0;
    }

    /**
     * Check whether a command-line binary exists on the system PATH.
     *
     * @param command - The binary name to search for (e.g. "certbot").
     * @returns true if the binary is found.
     */
    static commandExists(command: string): boolean {
        try {
            execSync(`command -v ${command}`, {
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "pipe"],
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Validate that a string is a valid proxy mode.
     *
     * @param mode - The string to check.
     * @returns true if the mode is "passthrough" or "full".
     */
    static isValidProxyMode(mode: string): mode is ProxyMode {
        return mode === "passthrough" || mode === "full";
    }

    /**
     * Validate that a string is a valid certificate method.
     *
     * @param method - The string to check.
     * @returns true if the method is "webroot" or "dns".
     */
    static isValidCertMethod(method: string): method is CertMethod {
        return method === "webroot" || method === "dns";
    }

    /**
     * Run a pre-flight check to verify all required binaries are installed.
     *
     * Returns a summary object indicating whether all requirements are
     * met and listing any missing binaries.
     *
     * @param requirements - Array of binary names to check (e.g. ["certbot", "nginx"]).
     * @returns An object with `ok` (all found) and `missing` (list of missing binaries).
     */
    static preflightCheck(requirements: string[]): { ok: boolean; missing: string[] } {
        const missing = requirements.filter((req) => !Validator.commandExists(req));
        return {
            ok: missing.length === 0,
            missing,
        };
    }
}
