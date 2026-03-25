/**
 * Tests for the Logger class.
 *
 * Covers log level filtering, file logging, formatting helpers,
 * and shell command result logging. Uses console spy to capture
 * output and temp files for file logging tests.
 *
 * @packageDocumentation
 */

import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { Logger } from "../src/logger";
import { IShellResult, LogLevel } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock IShellResult for testing commandResult(). */
function createShellResult(overrides: Partial<IShellResult> = {}): IShellResult {
    return {
        success: true,
        code: 0,
        stdout: "",
        stderr: "",
        command: "echo test",
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Log Level Filtering
// ---------------------------------------------------------------------------

describe("Logger — Level Filtering", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should output info messages at INFO level", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.INFO);

        logger.info("test info message");

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toContain("[INFO]");
        expect(spy.mock.calls[0][0]).toContain("test info message");
    });

    it("should suppress debug messages at INFO level", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.INFO);

        logger.debug("debug message");

        expect(spy).not.toHaveBeenCalled();
    });

    it("should output debug messages at DEBUG level", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.DEBUG);

        logger.debug("debug message");

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toContain("[DEBUG]");
    });

    it("should output warn messages at INFO level", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const logger = new Logger(LogLevel.INFO);

        logger.warn("warning message");

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toContain("[WARN]");
    });

    it("should output error messages at ERROR level", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        const logger = new Logger(LogLevel.ERROR);

        logger.error("error message");

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toContain("[ERROR]");
    });

    it("should suppress all messages except errors at ERROR level", () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const logger = new Logger(LogLevel.ERROR);

        logger.debug("debug");
        logger.info("info");
        logger.warn("warn");
        logger.error("error");

        expect(logSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it("should suppress all messages at QUIET level", () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const logger = new Logger(LogLevel.QUIET);

        logger.debug("debug");
        logger.info("info");
        logger.warn("warn");
        logger.error("error");

        expect(logSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("should include context object as JSON when provided", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.INFO);

        logger.info("test message", { key: "value" });

        const output = spy.mock.calls[0][0] as string;
        expect(output).toContain('"key":"value"');
    });

    it("should include a timestamp in the output", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.INFO);

        logger.info("timestamp test");

        const output = spy.mock.calls[0][0] as string;
        // Timestamp format: YYYY-MM-DD HH:MM:SS.mmm
        expect(output).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/);
    });
});

// ---------------------------------------------------------------------------
// File Logging
// ---------------------------------------------------------------------------

describe("Logger — File Logging", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxybuilder-logger-test-"));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should write log messages to the log file", () => {
        // Suppress console output.
        vi.spyOn(console, "log").mockImplementation(() => {});

        const logFile = path.join(tmpDir, "test.log");
        const logger = new Logger(LogLevel.INFO, logFile);

        logger.info("file logging test");

        expect(fs.existsSync(logFile)).toBe(true);
        const content = fs.readFileSync(logFile, "utf-8");
        expect(content).toContain("file logging test");
    });

    it("should strip ANSI codes from file output", () => {
        vi.spyOn(console, "log").mockImplementation(() => {});

        const logFile = path.join(tmpDir, "test.log");
        const logger = new Logger(LogLevel.INFO, logFile);

        logger.info("ansi test");

        const content = fs.readFileSync(logFile, "utf-8");
        // Should not contain ANSI escape sequences.
        // eslint-disable-next-line no-control-regex
        expect(content).not.toMatch(/\x1b\[[0-9;]*m/);
    });

    it("should create log directory if it does not exist", () => {
        vi.spyOn(console, "log").mockImplementation(() => {});

        const logFile = path.join(tmpDir, "nested", "dir", "test.log");
        const logger = new Logger(LogLevel.INFO, logFile);

        logger.info("nested dir test");

        expect(fs.existsSync(logFile)).toBe(true);
    });

    it("should append multiple log lines to the same file", () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});

        const logFile = path.join(tmpDir, "multi.log");
        const logger = new Logger(LogLevel.INFO, logFile);

        logger.info("line one");
        logger.warn("line two");

        const content = fs.readFileSync(logFile, "utf-8");
        expect(content).toContain("line one");
        expect(content).toContain("line two");
    });

    it("should not log to file when no logFile is configured", () => {
        vi.spyOn(console, "log").mockImplementation(() => {});

        // No log file — should not create any files.
        const logger = new Logger(LogLevel.INFO);
        logger.info("no file test");

        // Verify no files were created in tmpDir.
        const files = fs.readdirSync(tmpDir);
        expect(files).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

describe("Logger — Formatting Helpers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should output a blank line via blank()", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.INFO);

        logger.blank();

        expect(spy).toHaveBeenCalledWith("");
    });

    it("should output a bold section header via section()", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.INFO);

        logger.section("Test Section");

        expect(spy).toHaveBeenCalledTimes(1);
        const output = spy.mock.calls[0][0] as string;
        expect(output).toContain("Test Section");
        expect(output).toContain("═══");
    });

    it("should output a success message with checkmark via success()", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.INFO);

        logger.success("Operation complete");

        expect(spy).toHaveBeenCalledTimes(1);
        const output = spy.mock.calls[0][0] as string;
        expect(output).toContain("✔");
        expect(output).toContain("Operation complete");
    });

    it("should output a formatted table row via tableRow()", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.INFO);

        logger.tableRow(["Name", "Value"], [20, 10]);

        expect(spy).toHaveBeenCalledTimes(1);
        const output = spy.mock.calls[0][0] as string;
        expect(output).toContain("Name");
        expect(output).toContain("Value");
    });
});

// ---------------------------------------------------------------------------
// Shell Command Logging
// ---------------------------------------------------------------------------

describe("Logger — Shell Command Logging", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should log a command at DEBUG level via command()", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.DEBUG);

        logger.command("nginx -t");

        expect(spy).toHaveBeenCalledTimes(1);
        const output = spy.mock.calls[0][0] as string;
        expect(output).toContain("[CMD]");
        expect(output).toContain("nginx -t");
    });

    it("should include cwd when provided to command()", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.DEBUG);

        logger.command("ls", "/opt/proxybuilder");

        const output = spy.mock.calls[0][0] as string;
        expect(output).toContain("cwd: /opt/proxybuilder");
    });

    it("should not log command() at INFO level (below DEBUG)", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.INFO);

        logger.command("nginx -t");

        expect(spy).not.toHaveBeenCalled();
    });

    it("should log a successful commandResult with [OK] tag", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const logger = new Logger(LogLevel.DEBUG);

        logger.commandResult(createShellResult({ success: true, code: 0 }));

        const output = spy.mock.calls[0][0] as string;
        expect(output).toContain("[OK]");
        expect(output).toContain("exit code: 0");
    });

    it("should log a failed commandResult with [FAIL] tag", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const logger = new Logger(LogLevel.DEBUG);

        logger.commandResult(createShellResult({
            success: false,
            code: 1,
            stderr: "nginx: configuration error",
        }));

        // First call: the [FAIL] line, second call: the stderr.
        expect(errorSpy).toHaveBeenCalledTimes(2);
        const failLine = errorSpy.mock.calls[0][0] as string;
        expect(failLine).toContain("[FAIL]");
        expect(failLine).toContain("exit code: 1");
    });

    it("should not log commandResult at INFO level", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const logger = new Logger(LogLevel.INFO);

        logger.commandResult(createShellResult());

        expect(spy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });
});
