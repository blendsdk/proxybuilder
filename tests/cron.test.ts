/**
 * Tests for the cron job management module.
 *
 * Tests the installCronJob, removeCronJob, and cronJobExists functions
 * using a mock Shell that records executed commands instead of running them.
 * This avoids modifying the real crontab during tests.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { installCronJob, removeCronJob, cronJobExists } from "../src/cron";
import { Shell } from "../src/shell";
import { Logger } from "../src/logger";
import { IShellResult, LogLevel } from "../src/types";
import { CRON_SCHEDULE } from "../src/constants";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Create a Logger with QUIET level so tests produce no console output. */
function createQuietLogger(): Logger {
    return new Logger(LogLevel.QUIET);
}

/**
 * Build a synthetic IShellResult for testing.
 * Mimics the structure returned by Shell.exec().
 */
function makeResult(success: boolean, stdout = "", command = ""): IShellResult {
    return { success, code: success ? 0 : 1, stdout, stderr: "", command };
}

/**
 * Create a Shell with a mocked exec method.
 *
 * The mock returns different results based on the command string:
 * - "crontab -l": returns the provided crontab content.
 * - Other commands: returns success.
 *
 * Records all exec calls for inspection.
 */
function createMockShell(crontabContent: string, hasCrontab = true) {
    const logger = createQuietLogger();
    const shell = new Shell(logger, true); // Dry-run base.
    const execCalls: string[] = [];

    // Override exec to return canned responses.
    vi.spyOn(shell, "exec").mockImplementation((command: string) => {
        execCalls.push(command);

        if (command === "crontab -l") {
            if (hasCrontab) {
                return makeResult(true, crontabContent, command);
            }
            // No crontab — crontab -l exits non-zero.
            return makeResult(false, "", command);
        }

        // All other commands succeed.
        return makeResult(true, "", command);
    });

    return { shell, execCalls };
}

// ---------------------------------------------------------------------------
// cronJobExists
// ---------------------------------------------------------------------------

describe("Cron — cronJobExists", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should return true when the proxybuilder marker is in the crontab", () => {
        const { shell } = createMockShell(
            "0 3 * * * proxybuilder renew --target /opt/proxybuilder # proxybuilder-auto-renew",
        );
        expect(cronJobExists(shell)).toBe(true);
    });

    it("should return false when the crontab has no proxybuilder marker", () => {
        const { shell } = createMockShell(
            "0 5 * * * /usr/bin/backup.sh\n",
        );
        expect(cronJobExists(shell)).toBe(false);
    });

    it("should return false when no crontab exists", () => {
        const { shell } = createMockShell("", false);
        expect(cronJobExists(shell)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// installCronJob
// ---------------------------------------------------------------------------

describe("Cron — installCronJob", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should install a cron entry when none exists", () => {
        const { shell, execCalls } = createMockShell("", false);
        const logger = createQuietLogger();

        installCronJob("/opt/proxybuilder", shell, logger);

        // Should have called crontab -l to check, then written new entry.
        expect(execCalls.length).toBeGreaterThanOrEqual(2);
        // The install command should contain the cron entry via pipe.
        const installCmd = execCalls.find((cmd) => cmd.includes("crontab -"));
        expect(installCmd).toBeDefined();
    });

    it("should skip installation when marker already exists", () => {
        const { shell, execCalls } = createMockShell(
            "0 3 * * * proxybuilder renew --target /opt/proxybuilder # proxybuilder-auto-renew",
        );
        const logger = createQuietLogger();

        installCronJob("/opt/proxybuilder", shell, logger);

        // Should only have called crontab -l to check. No write command.
        // cronJobExists calls crontab -l once, then installCronJob returns.
        const writeCmds = execCalls.filter((cmd) => cmd.includes("| crontab"));
        expect(writeCmds.length).toBe(0);
    });

    it("should include the target path in the cron command", () => {
        const { shell, execCalls } = createMockShell("", false);
        const logger = createQuietLogger();

        installCronJob("/custom/path", shell, logger);

        // The pipe command should contain the target path.
        const installCmd = execCalls.find((cmd) => cmd.includes("| crontab"));
        expect(installCmd).toContain("/custom/path");
    });

    it("should include the configured cron schedule", () => {
        const { shell, execCalls } = createMockShell("", false);
        const logger = createQuietLogger();

        installCronJob("/opt/proxybuilder", shell, logger);

        const installCmd = execCalls.find((cmd) => cmd.includes("| crontab"));
        expect(installCmd).toContain(CRON_SCHEDULE);
    });
});

// ---------------------------------------------------------------------------
// removeCronJob
// ---------------------------------------------------------------------------

describe("Cron — removeCronJob", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should remove the proxybuilder entry from the crontab", () => {
        const { shell, execCalls } = createMockShell(
            "0 5 * * * /usr/bin/backup.sh\n0 3 * * * proxybuilder renew # proxybuilder-auto-renew",
        );
        const logger = createQuietLogger();

        removeCronJob(shell, logger);

        // Should have written a new crontab without the proxybuilder entry.
        const writeCmd = execCalls.find((cmd) => cmd.includes("| crontab"));
        expect(writeCmd).toBeDefined();
        // The written content should NOT contain the marker.
        expect(writeCmd).not.toContain("proxybuilder-auto-renew");
    });

    it("should do nothing when no crontab exists", () => {
        const { shell, execCalls } = createMockShell("", false);
        const logger = createQuietLogger();

        removeCronJob(shell, logger);

        // Should only have called crontab -l.
        const writeCmds = execCalls.filter((cmd) => cmd.includes("| crontab"));
        expect(writeCmds.length).toBe(0);
    });

    it("should do nothing when crontab has no proxybuilder entry", () => {
        const { shell, execCalls } = createMockShell(
            "0 5 * * * /usr/bin/backup.sh\n",
        );
        const logger = createQuietLogger();

        removeCronJob(shell, logger);

        // Should only have read crontab, no write.
        const writeCmds = execCalls.filter((cmd) => cmd.includes("| crontab"));
        expect(writeCmds.length).toBe(0);
    });

    it("should remove crontab entirely when proxybuilder was the only entry", () => {
        const { shell, execCalls } = createMockShell(
            "0 3 * * * proxybuilder renew --target /opt/proxybuilder # proxybuilder-auto-renew",
        );
        const logger = createQuietLogger();

        removeCronJob(shell, logger);

        // When no entries remain, should call crontab -r.
        const removeCmd = execCalls.find((cmd) => cmd === "crontab -r");
        expect(removeCmd).toBeDefined();
    });
});
