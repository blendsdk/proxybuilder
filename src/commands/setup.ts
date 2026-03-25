/**
 * Setup command — installs system-level prerequisites for proxybuilder.
 *
 * Automates installation of nginx, certbot, and firewall configuration
 * on Debian/Ubuntu systems. This is typically run once per server before
 * `proxybuilder init`.
 *
 * Must be run as root (sudo).
 *
 * @packageDocumentation
 */

import fs from "fs";
import { CommandBuilder } from "yargs";

import { ICommonArgs, LogLevel } from "../types";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { Validator } from "../validator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `setup` command. */
interface ISetupArgs extends ICommonArgs {
    "dry-run": boolean;
}

// ---------------------------------------------------------------------------
// OS Detection
// ---------------------------------------------------------------------------

/**
 * Check whether the current system is Debian or Ubuntu based.
 *
 * Reads `/etc/os-release` to detect the OS family. Only Debian-based
 * systems are supported because the setup command uses `apt-get` and
 * `snap` for package management.
 *
 * @returns true if the system is Debian or Ubuntu based.
 */
function isDebianBased(): boolean {
    try {
        if (!fs.existsSync("/etc/os-release")) {
            return false;
        }
        const content = fs.readFileSync("/etc/os-release", "utf-8").toLowerCase();
        return content.includes("debian") || content.includes("ubuntu");
    } catch {
        return false;
    }
}

/**
 * Read the human-readable OS description from `/etc/os-release`.
 *
 * Falls back to "Unknown" if the file is missing or the field is absent.
 *
 * @returns OS name string (e.g. "Ubuntu 22.04 LTS").
 */
function getOsDescription(): string {
    try {
        const content = fs.readFileSync("/etc/os-release", "utf-8");
        const match = content.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
        return match?.[1] ?? "Unknown";
    } catch {
        return "Unknown";
    }
}

// ---------------------------------------------------------------------------
// Package Lists
// ---------------------------------------------------------------------------

/**
 * Base system packages required by proxybuilder.
 *
 * These are standard utilities needed for HTTPS, package signing,
 * and general operation.
 */
const BASE_PACKAGES = [
    "apt-transport-https",
    "ca-certificates",
    "curl",
    "gnupg-agent",
    "software-properties-common",
    "wget",
];

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

/** Yargs command name. */
export const command = "setup";

/** Yargs command description shown in `--help`. */
export const desc = "Install system prerequisites (nginx, certbot, firewall)";

/** Yargs option definitions for the setup command. */
export const builder: CommandBuilder = {
    "dry-run": {
        type: "boolean",
        default: false,
        description: "Show what would be installed without executing",
    },
};

/**
 * Handler for the `proxybuilder setup` command.
 *
 * Installs nginx, certbot (via snap), configures UFW firewall, and
 * verifies all installations. Supports dry-run mode to preview actions.
 *
 * @param argv - Parsed CLI arguments including global options and --dry-run.
 */
export const handler = (argv: ISetupArgs): void => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const shell = new Shell(logger, argv["dry-run"]);
    const dryRun = argv["dry-run"];

    // Section header
    logger.section("System Setup");
    logger.blank();

    // --- Pre-flight: Must be root ---
    if (!dryRun && !Validator.isRoot()) {
        logger.error("The setup command must be run as root (use sudo)");
        process.exit(1);
    }

    // --- Pre-flight: Must be Debian/Ubuntu ---
    if (!isDebianBased()) {
        logger.error("This tool only supports Debian/Ubuntu systems");
        process.exit(1);
    }

    // --- Detect OS ---
    logger.section("Detecting system");
    const osName = getOsDescription();
    const arch = process.arch;
    logger.info(`OS: ${osName}`);
    logger.info(`Architecture: ${arch}`);
    logger.blank();

    // --- Install base packages ---
    logger.section("Installing system packages");
    shell.exec("apt-get update -y", { fatal: true });
    logger.success("Package lists updated");

    shell.exec(`apt-get install -y ${BASE_PACKAGES.join(" ")}`, { fatal: true });
    logger.success("Base packages installed");
    logger.blank();

    // --- Install nginx ---
    logger.section("Installing nginx");
    if (!dryRun && Validator.commandExists("nginx")) {
        // Nginx already installed — report version and skip.
        const version = getVersionString(shell, "nginx -v");
        logger.info(`nginx already installed (${version})`);
    } else {
        shell.exec("apt-get install -y nginx", { fatal: true });
        logger.success("nginx installed");
    }
    logger.blank();

    // --- Install snapd + certbot ---
    logger.section("Installing certbot");
    shell.exec("apt-get install -y snapd", { fatal: true });
    logger.success("snapd installed");

    shell.exec("snap install --classic certbot", { fatal: false });
    logger.success("certbot installed via snap");

    // Create certbot symlink so it's available on PATH.
    shell.exec("ln -sf /snap/bin/certbot /usr/bin/certbot", { fatal: false });
    logger.success("certbot symlink created");
    logger.blank();

    // --- Configure firewall (UFW) ---
    logger.section("Configuring firewall");
    shell.exec("ufw allow OpenSSH", { fatal: false });
    shell.exec("ufw allow 'Nginx Full'", { fatal: false });
    shell.exec("ufw --force enable", { fatal: false });
    logger.success("Firewall configured");
    logger.blank();

    // --- Verification ---
    logger.section("Verification");
    verifyBinary(shell, logger, "nginx", "nginx -v");
    verifyBinary(shell, logger, "certbot", "certbot --version");
    verifyBinary(shell, logger, "openssl", "openssl version");
    logger.blank();

    // --- Summary ---
    logger.success("System setup complete!");
    logger.info("Next: run 'proxybuilder init --email your@email.com'");
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get a version string from a command, returning "unknown" on failure.
 *
 * Many tools print version info to stderr (e.g. `nginx -v`), so we
 * capture both stdout and stderr.
 *
 * @param shell   - Shell executor instance.
 * @param command - The version command to run (e.g. "nginx -v").
 * @returns The version string or "unknown".
 */
function getVersionString(shell: Shell, command: string): string {
    try {
        const result = shell.exec(command, { fatal: false, silent: true });
        // Some tools write version to stderr (e.g. nginx -v).
        const output = result.stdout.trim() || result.stderr.trim();
        return output || "unknown";
    } catch {
        return "unknown";
    }
}

/**
 * Verify that a binary is installed and log its version.
 *
 * @param shell   - Shell executor instance.
 * @param logger  - Logger for output.
 * @param name    - Human-readable name of the binary.
 * @param command - The command to get the version string.
 */
function verifyBinary(shell: Shell, logger: Logger, name: string, command: string): void {
    const version = getVersionString(shell, command);
    if (version !== "unknown") {
        logger.success(`${name}: ${version}`);
    } else {
        logger.warn(`${name}: not found or version could not be determined`);
    }
}
