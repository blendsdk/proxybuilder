/**
 * Logging system for the proxybuilder CLI.
 *
 * Provides level-based console output with ANSI colours and optional
 * file logging (without colours). All commands should use a shared
 * Logger instance so output is consistently formatted.
 *
 * @packageDocumentation
 */

import fs from "fs";
import path from "path";

import { IShellResult, LogLevel } from "./types";

// ---------------------------------------------------------------------------
// ANSI Colour Helpers
// ---------------------------------------------------------------------------

/** ANSI escape codes for coloured terminal output. */
const ANSI = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    gray: "\x1b[90m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
} as const;

/**
 * Strip all ANSI escape codes from a string.
 *
 * Used when writing log lines to a file where colour codes would be
 * unreadable noise.
 */
function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/**
 * Level-based logger with coloured console output and optional file logging.
 *
 * Usage:
 * ```ts
 * const logger = new Logger(LogLevel.INFO);
 * logger.info("Starting proxy creation");
 * logger.debug("Upstream list", { upstreams: ["127.0.0.1:3000"] });
 * ```
 */
export class Logger {
    /** Current verbosity threshold — messages below this level are suppressed. */
    protected level: LogLevel;

    /** Absolute path to the log file, or null if file logging is disabled. */
    protected logFile: string | null;

    /**
     * Create a new Logger.
     *
     * @param level   - Minimum level a message must have to be emitted.
     * @param logFile - Optional path to a file for persistent logging.
     */
    constructor(level: LogLevel, logFile?: string) {
        this.level = level;
        this.logFile = logFile ?? null;
    }

    // -----------------------------------------------------------------------
    // Core log method
    // -----------------------------------------------------------------------

    /**
     * Write a log message if the current level permits it.
     *
     * Formats the message with a timestamp and level tag, applies colour
     * to console output, and appends a plain-text version to the log file
     * when file logging is enabled.
     *
     * @param level   - Severity of this message.
     * @param message - Human-readable log line.
     * @param context - Optional structured data appended as JSON.
     */
    protected log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
        if (level > this.level) {
            return;
        }

        const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
        const tag = this.formatTag(level);
        const contextStr = context ? ` ${JSON.stringify(context)}` : "";
        const line = `${timestamp} ${tag} ${message}${contextStr}`;

        // Write coloured output to the appropriate console stream.
        if (level <= LogLevel.ERROR) {
            console.error(line);
        } else if (level <= LogLevel.WARN) {
            console.warn(line);
        } else {
            console.log(line);
        }

        // Append plain-text line to the log file (best-effort, never throws).
        this.appendToFile(line);
    }

    // -----------------------------------------------------------------------
    // Convenience methods
    // -----------------------------------------------------------------------

    /**
     * Log a debug-level message. Only visible when --verbose is enabled.
     *
     * @param message - The debug message.
     * @param context - Optional structured data.
     */
    debug(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.DEBUG, message, context);
    }

    /**
     * Log an informational message.
     *
     * @param message - The info message.
     * @param context - Optional structured data.
     */
    info(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.INFO, message, context);
    }

    /**
     * Log a warning message.
     *
     * @param message - The warning message.
     * @param context - Optional structured data.
     */
    warn(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.WARN, message, context);
    }

    /**
     * Log an error message.
     *
     * @param message - The error message.
     * @param context - Optional structured data.
     */
    error(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevel.ERROR, message, context);
    }

    // -----------------------------------------------------------------------
    // Shell command helpers
    // -----------------------------------------------------------------------

    /**
     * Log the shell command that is about to be executed.
     *
     * Uses the CMD tag (cyan) so command execution is visually distinct.
     *
     * @param cmd - The shell command string.
     * @param cwd - Optional working directory for context.
     */
    command(cmd: string, cwd?: string): void {
        const cwdSuffix = cwd ? ` (cwd: ${cwd})` : "";
        const line = `${ANSI.cyan}[CMD]${ANSI.reset}   ${cmd}${cwdSuffix}`;
        if (this.level >= LogLevel.DEBUG) {
            const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
            console.log(`${timestamp} ${line}`);
            this.appendToFile(`${timestamp} [CMD]   ${cmd}${cwdSuffix}`);
        }
    }

    /**
     * Log the result of a shell command execution.
     *
     * Shows a green OK tag on success and a red ERROR tag on failure.
     *
     * @param result - The shell execution result.
     */
    commandResult(result: IShellResult): void {
        if (this.level < LogLevel.DEBUG) {
            return;
        }

        const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");

        if (result.success) {
            const line = `${ANSI.green}[OK]${ANSI.reset}    Command completed (exit code: ${result.code})`;
            console.log(`${timestamp} ${line}`);
            this.appendToFile(`${timestamp} [OK]    Command completed (exit code: ${result.code})`);
        } else {
            const line = `${ANSI.red}[FAIL]${ANSI.reset}  Command failed (exit code: ${result.code})`;
            console.error(`${timestamp} ${line}`);
            this.appendToFile(`${timestamp} [FAIL]  Command failed (exit code: ${result.code})`);
            if (result.stderr) {
                console.error(`${ANSI.red}${result.stderr}${ANSI.reset}`);
                this.appendToFile(result.stderr);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Formatting helpers
    // -----------------------------------------------------------------------

    /**
     * Write a blank line to the console for visual spacing.
     */
    blank(): void {
        console.log("");
    }

    /**
     * Write a bold section header line.
     *
     * @param title - The section title text.
     */
    section(title: string): void {
        const line = `${ANSI.bold}${ANSI.white}═══ ${title} ═══${ANSI.reset}`;
        console.log(line);
        this.appendToFile(`═══ ${title} ═══`);
    }

    /**
     * Write a success message with a green checkmark.
     *
     * @param message - The success message text.
     */
    success(message: string): void {
        const line = `${ANSI.green}✔${ANSI.reset} ${message}`;
        console.log(line);
        this.appendToFile(`✔ ${message}`);
    }

    /**
     * Write a formatted table row with fixed-width columns.
     *
     * @param columns - Array of cell values.
     * @param widths  - Array of column widths (characters). Must match columns length.
     */
    tableRow(columns: string[], widths: number[]): void {
        const formatted = columns
            .map((col, i) => col.padEnd(widths[i] ?? 10))
            .join("  ");
        console.log(formatted);
        this.appendToFile(formatted);
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Build the coloured log-level tag string.
     *
     * @param level - The log level to format.
     * @returns A coloured tag like `[INFO]` with ANSI codes.
     */
    protected formatTag(level: LogLevel): string {
        switch (level) {
            case LogLevel.DEBUG:
                return `${ANSI.gray}[DEBUG]${ANSI.reset}`;
            case LogLevel.INFO:
                return `${ANSI.white}[INFO]${ANSI.reset} `;
            case LogLevel.WARN:
                return `${ANSI.yellow}[WARN]${ANSI.reset} `;
            case LogLevel.ERROR:
                return `${ANSI.red}[ERROR]${ANSI.reset}`;
            default:
                return "[???]  ";
        }
    }

    /**
     * Append a line to the log file (if configured).
     *
     * Strips ANSI codes before writing. Silently ignores write errors
     * so that logging failures never crash the CLI.
     *
     * @param line - The log line to append.
     */
    protected appendToFile(line: string): void {
        if (!this.logFile) {
            return;
        }

        try {
            // Ensure the directory exists before writing.
            const dir = path.dirname(this.logFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.appendFileSync(this.logFile, stripAnsi(line) + "\n");
        } catch {
            // Logging should never crash the application.
        }
    }
}
