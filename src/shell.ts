/**
 * Shell command executor for the proxybuilder CLI.
 *
 * Wraps `child_process.spawnSync` with structured result objects,
 * logging integration, dry-run support, and optional sudo elevation.
 * Every external command (certbot, nginx, openssl, etc.) should be
 * invoked through this module.
 *
 * @packageDocumentation
 */

import { execSync, spawnSync } from "child_process";
import { IShellResult } from "./types";
import { Logger } from "./logger";

// ---------------------------------------------------------------------------
// Options Interface
// ---------------------------------------------------------------------------

/** Options for a single shell command execution. */
export interface IShellExecOptions {
    /** Working directory for the command. Defaults to process.cwd(). */
    cwd?: string;

    /** Prepend `sudo` to the command. */
    sudo?: boolean;

    /**
     * Throw an error on non-zero exit code.
     * @default true
     */
    fatal?: boolean;

    /**
     * Suppress stdout/stderr logging (useful for commands with credentials).
     * The command line itself is still logged unless the level is below DEBUG.
     */
    silent?: boolean;
}

// ---------------------------------------------------------------------------
// Shell Executor
// ---------------------------------------------------------------------------

/**
 * Executes shell commands and returns structured results.
 *
 * All commands are logged via the injected Logger. In dry-run mode
 * commands are logged but not actually executed, returning a synthetic
 * success result.
 *
 * Usage:
 * ```ts
 * const shell = new Shell(logger, false);
 * const result = shell.exec("nginx -t", { fatal: true });
 * ```
 */
export class Shell {
    /** Logger instance for command and result output. */
    protected logger: Logger;

    /**
     * When true, commands are logged but not executed.
     * Useful for previewing what the CLI would do.
     */
    protected dryRun: boolean;

    /**
     * Create a new Shell executor.
     *
     * @param logger - Logger instance for output.
     * @param dryRun - If true, commands are logged but not executed.
     */
    constructor(logger: Logger, dryRun: boolean) {
        this.logger = logger;
        this.dryRun = dryRun;
    }

    /**
     * Execute a shell command and return a structured result.
     *
     * In dry-run mode the command is logged with a "[DRY RUN]" prefix
     * and a synthetic success result is returned without execution.
     *
     * @param command - The shell command string to execute.
     * @param options - Optional execution settings.
     * @returns The execution result including stdout, stderr, and exit code.
     * @throws Error if `fatal` is true (default) and the command exits non-zero.
     */
    exec(command: string, options: IShellExecOptions = {}): IShellResult {
        const { cwd, sudo = false, fatal = true, silent = false } = options;

        // Prepend sudo if requested.
        const fullCommand = sudo ? `sudo ${command}` : command;

        // Log the command being executed.
        this.logger.command(this.dryRun ? `[DRY RUN] ${fullCommand}` : fullCommand, cwd);

        // In dry-run mode, return a synthetic success result.
        if (this.dryRun) {
            const dryResult: IShellResult = {
                success: true,
                code: 0,
                stdout: "",
                stderr: "",
                command: fullCommand,
            };
            this.logger.commandResult(dryResult);
            return dryResult;
        }

        // Use spawnSync via sh -c so both stdout and stderr are always
        // captured — execSync only returns stdout and discards stderr
        // on success, which breaks version detection for tools like
        // `nginx -v` that write to stderr.
        const spawnResult = spawnSync("sh", ["-c", fullCommand], {
            cwd,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            // 5 minute timeout to prevent hanging commands (e.g. certbot).
            timeout: 5 * 60 * 1000,
        });

        const result: IShellResult = {
            success: spawnResult.status === 0,
            code: spawnResult.status ?? 1,
            stdout: spawnResult.stdout ?? "",
            stderr: spawnResult.stderr ?? "",
            command: fullCommand,
        };

        // Log result and optionally suppress output content.
        this.logger.commandResult(result);

        if (result.success) {
            if (!silent && result.stdout.trim()) {
                this.logger.debug(result.stdout.trim());
            }
            return result;
        }

        // Command failed — throw or return based on fatal flag.
        if (fatal) {
            const friendlyMessage = [
                `Command failed: ${fullCommand}`,
                result.stderr ? `Error: ${result.stderr.trim()}` : "",
                `Exit code: ${result.code}`,
            ]
                .filter(Boolean)
                .join("\n");

            throw new Error(friendlyMessage);
        }

        return result;
    }

    /**
     * Check whether a binary exists on the system PATH.
     *
     * Uses `which` (or `command -v` as fallback) to probe for the binary.
     *
     * @param binary - The binary name to search for (e.g. "certbot").
     * @returns true if the binary is found, false otherwise.
     */
    commandExists(binary: string): boolean {
        try {
            execSync(`command -v ${binary}`, {
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "pipe"],
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Execute a command and return its stdout, trimmed.
     *
     * This is a convenience wrapper for simple commands where only the
     * text output matters (e.g. reading a version string).
     *
     * @param command - The shell command to execute.
     * @param options - Optional cwd override.
     * @returns Trimmed stdout string.
     * @throws Error if the command fails.
     */
    execCapture(command: string, options?: { cwd?: string }): string {
        const result = this.exec(command, {
            cwd: options?.cwd,
            fatal: true,
            silent: true,
        });
        return result.stdout.trim();
    }
}
