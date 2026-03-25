/**
 * Tests for the Shell command executor.
 *
 * Tests cover dry-run mode, real command execution, fatal/non-fatal
 * error handling, sudo prefixing, silent mode, commandExists(),
 * and the execCapture() convenience wrapper.
 *
 * Uses real shell commands (echo, true, false) for actual execution
 * tests, and dry-run mode for verifying the synthetic result path.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { Shell } from "../src/shell";
import { Logger } from "../src/logger";
import { LogLevel } from "../src/types";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Create a Logger with QUIET level so tests produce no console output. */
function createQuietLogger(): Logger {
    return new Logger(LogLevel.QUIET);
}

/** Create a DEBUG-level logger for tests that verify log output. */
function createDebugLogger(): Logger {
    return new Logger(LogLevel.DEBUG);
}

// ---------------------------------------------------------------------------
// Dry-Run Mode
// ---------------------------------------------------------------------------

describe("Shell — Dry-Run Mode", () => {
    it("should return synthetic success without executing the command", () => {
        const shell = new Shell(createQuietLogger(), true);

        // A command that would fail if actually executed.
        const result = shell.exec("nonexistent_command_that_would_fail");

        expect(result.success).toBe(true);
        expect(result.code).toBe(0);
    });

    it("should return empty stdout and stderr in dry-run result", () => {
        const shell = new Shell(createQuietLogger(), true);
        const result = shell.exec("echo hello");

        expect(result.stdout).toBe("");
        expect(result.stderr).toBe("");
    });

    it("should include the full command string in the result", () => {
        const shell = new Shell(createQuietLogger(), true);
        const result = shell.exec("echo hello world");

        expect(result.command).toBe("echo hello world");
    });

    it("should include sudo prefix in the command string when sudo is true", () => {
        const shell = new Shell(createQuietLogger(), true);
        const result = shell.exec("apt-get update", { sudo: true });

        expect(result.command).toBe("sudo apt-get update");
    });

    it("should log the command with [DRY RUN] prefix", () => {
        const logger = createDebugLogger();
        // Spy on the command method to verify the dry-run prefix.
        const commandSpy = vi.spyOn(logger, "command");

        const shell = new Shell(logger, true);
        shell.exec("nginx -t");

        expect(commandSpy).toHaveBeenCalledWith(
            expect.stringContaining("[DRY RUN]"),
            undefined,
        );
    });
});

// ---------------------------------------------------------------------------
// Real Command Execution
// ---------------------------------------------------------------------------

describe("Shell — Real Command Execution", () => {
    it("should execute a simple command and return success", () => {
        const shell = new Shell(createQuietLogger(), false);
        const result = shell.exec("echo hello");

        expect(result.success).toBe(true);
        expect(result.code).toBe(0);
    });

    it("should capture stdout from the command", () => {
        const shell = new Shell(createQuietLogger(), false);
        const result = shell.exec("echo hello");

        expect(result.stdout.trim()).toBe("hello");
    });

    it("should return the full command string in the result", () => {
        const shell = new Shell(createQuietLogger(), false);
        const result = shell.exec("echo test");

        expect(result.command).toBe("echo test");
    });

    it("should throw an error when fatal is true and command fails", () => {
        const shell = new Shell(createQuietLogger(), false);

        expect(() => {
            shell.exec("false", { fatal: true });
        }).toThrow(/Command failed/);
    });

    it("should return a failure result when fatal is false and command fails", () => {
        const shell = new Shell(createQuietLogger(), false);
        const result = shell.exec("false", { fatal: false });

        expect(result.success).toBe(false);
        expect(result.code).not.toBe(0);
    });

    it("should include the exit code in the thrown error message", () => {
        const shell = new Shell(createQuietLogger(), false);

        expect(() => {
            // `exit 42` returns exit code 42.
            shell.exec("bash -c 'exit 42'", { fatal: true });
        }).toThrow(/Exit code: 42/);
    });

    it("should include stderr in the failure result", () => {
        const shell = new Shell(createQuietLogger(), false);
        const result = shell.exec("bash -c 'echo oops >&2; exit 1'", { fatal: false });

        expect(result.success).toBe(false);
        expect(result.stderr).toContain("oops");
    });

    it("should default fatal to true", () => {
        const shell = new Shell(createQuietLogger(), false);

        // 'false' exits with code 1 — should throw because fatal defaults to true.
        expect(() => {
            shell.exec("false");
        }).toThrow();
    });
});

// ---------------------------------------------------------------------------
// Sudo Prefix
// ---------------------------------------------------------------------------

describe("Shell — Sudo Prefix", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should prepend sudo to the command when sudo option is true (dry-run)", () => {
        // Use dry-run to avoid actually running sudo.
        const shell = new Shell(createQuietLogger(), true);
        const result = shell.exec("nginx -t", { sudo: true });

        expect(result.command).toBe("sudo nginx -t");
    });

    it("should not prepend sudo when sudo option is not set", () => {
        const shell = new Shell(createQuietLogger(), true);
        const result = shell.exec("nginx -t");

        expect(result.command).toBe("nginx -t");
    });

    it("should not prepend sudo when sudo option is explicitly false", () => {
        const shell = new Shell(createQuietLogger(), true);
        const result = shell.exec("nginx -t", { sudo: false });

        expect(result.command).toBe("nginx -t");
    });
});

// ---------------------------------------------------------------------------
// Silent Mode
// ---------------------------------------------------------------------------

describe("Shell — Silent Mode", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should not log stdout content when silent is true", () => {
        const logger = createDebugLogger();
        const debugSpy = vi.spyOn(logger, "debug");

        const shell = new Shell(logger, false);
        shell.exec("echo 'secret output'", { silent: true });

        // The debug method should NOT have been called with the command output.
        // It might be called for other reasons (command logging), but not with stdout.
        const debugCalls = debugSpy.mock.calls.map((call) => call[0]);
        const hasSecretOutput = debugCalls.some((msg) =>
            typeof msg === "string" && msg.includes("secret output"),
        );
        expect(hasSecretOutput).toBe(false);
    });

    it("should log stdout content when silent is false", () => {
        const logger = createDebugLogger();
        const debugSpy = vi.spyOn(logger, "debug");

        const shell = new Shell(logger, false);
        shell.exec("echo 'visible output'", { silent: false });

        // The debug method should have been called with the stdout content.
        const debugCalls = debugSpy.mock.calls.map((call) => call[0]);
        const hasVisibleOutput = debugCalls.some((msg) =>
            typeof msg === "string" && msg.includes("visible output"),
        );
        expect(hasVisibleOutput).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// commandExists()
// ---------------------------------------------------------------------------

describe("Shell — commandExists()", () => {
    it("should return true for a known system binary (node)", () => {
        const shell = new Shell(createQuietLogger(), false);
        expect(shell.commandExists("node")).toBe(true);
    });

    it("should return true for bash", () => {
        const shell = new Shell(createQuietLogger(), false);
        expect(shell.commandExists("bash")).toBe(true);
    });

    it("should return false for a non-existent binary", () => {
        const shell = new Shell(createQuietLogger(), false);
        expect(shell.commandExists("definitely_not_a_real_binary_xyz_999")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// execCapture()
// ---------------------------------------------------------------------------

describe("Shell — execCapture()", () => {
    it("should return trimmed stdout from a successful command", () => {
        const shell = new Shell(createQuietLogger(), false);
        const output = shell.execCapture("echo '  hello  '");

        // echo adds a newline, execCapture trims, plus our leading/trailing spaces.
        expect(output).toBe("hello");
    });

    it("should throw on command failure", () => {
        const shell = new Shell(createQuietLogger(), false);

        expect(() => {
            shell.execCapture("false");
        }).toThrow();
    });

    it("should execute silently (not log stdout content)", () => {
        const logger = createDebugLogger();
        const debugSpy = vi.spyOn(logger, "debug");

        const shell = new Shell(logger, false);
        shell.execCapture("echo 'captured-secret'");

        // execCapture uses silent:true, so stdout should not be logged.
        const debugCalls = debugSpy.mock.calls.map((call) => call[0]);
        const hasSecret = debugCalls.some((msg) =>
            typeof msg === "string" && msg.includes("captured-secret"),
        );
        expect(hasSecret).toBe(false);

        vi.restoreAllMocks();
    });

    it("should return an empty string for commands with no output", () => {
        const shell = new Shell(createQuietLogger(), false);
        const output = shell.execCapture("true");

        expect(output).toBe("");
    });
});
