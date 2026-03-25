/**
 * Status command — display comprehensive health overview.
 *
 * Shows system status (nginx, certbot, cron), domain summary,
 * certificate health with expiry warnings, and disk usage.
 *
 * @packageDocumentation
 */

import fs from "fs";
import path from "path";
import { CommandBuilder } from "yargs";

import { ICommonArgs, LogLevel } from "../types";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { ProxyBuilder } from "../builder";
import { cronJobExists } from "../cron";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `status` command. */
interface IStatusArgs extends ICommonArgs {
    json: boolean;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

export const command = "status";
export const desc = "Display proxybuilder health overview";

export const builder: CommandBuilder = {
    json: {
        type: "boolean",
        default: false,
        description: "Output as JSON",
    },
};

/**
 * Handler for the `proxybuilder status` command.
 *
 * Gathers and displays system health, domain summary, cert health,
 * and disk usage information.
 *
 * @param argv - Parsed CLI arguments.
 */
export const handler = (argv: IStatusArgs): void => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const shell = new Shell(logger, false);
    const target = path.resolve(argv.target);

    // Load config.
    const proxyBuilder = new ProxyBuilder(target, logger, shell);
    const config = proxyBuilder.loadConfig();

    if (!config) {
        logger.error("Not initialized. Run 'proxybuilder init' first.");
        process.exit(1);
    }

    const configManager = proxyBuilder.getConfigManager();
    const domains = configManager.listDomains();

    // Gather system info.
    const nginxStatus = checkNginx(shell);
    const certbotVersion = getVersion(shell, "certbot --version");
    const hasCron = cronJobExists(shell);

    // Gather domain stats.
    const enabled = domains.filter(({ config: dc }) => dc.enabled).length;
    const disabled = domains.length - enabled;
    const inMaintenance = domains.filter(({ config: dc }) => dc.maintenance).length;

    // Gather cert health.
    const certs = domains.map(({ domain, config: dc }) => {
        const expiry = proxyBuilder.getCertExpiry(domain);
        const daysLeft = calculateDaysLeft(expiry);
        return {
            domain,
            expires: expiry,
            daysLeft,
            status: getCertStatus(daysLeft, dc.staging),
            staging: dc.staging,
        };
    });

    // --- JSON output ---
    if (argv.json) {
        const jsonOutput = {
            version: "2.0.0",
            target,
            system: {
                nginx: nginxStatus,
                certbot: { installed: certbotVersion !== "N/A", version: certbotVersion },
                cron: { installed: hasCron },
            },
            domains: { total: domains.length, enabled, disabled, maintenance: inMaintenance },
            certificates: certs,
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
        return;
    }

    // --- Formatted output ---
    logger.section("Proxybuilder Status");
    console.log("");
    console.log(`  Version:    2.0.0`);
    console.log(`  Target:     ${target}`);
    console.log(`  Config:     ✓ Valid`);

    console.log("");
    console.log("─── System ───────────────────────────────────────");
    console.log(`  nginx:      ${nginxStatus.running ? `✓ Running (pid ${nginxStatus.pid})` : "✗ Not running"}`);
    console.log(`  certbot:    ${certbotVersion !== "N/A" ? `✓ ${certbotVersion}` : "✗ Not found"}`);
    console.log(`  Cron:       ${hasCron ? "✓ Installed" : "✗ Not installed"}`);

    console.log("");
    console.log(`─── Domains (${domains.length} total) ────────────────────────────`);
    console.log(`  Enabled:      ${enabled}`);
    console.log(`  Disabled:     ${disabled}`);
    console.log(`  Maintenance:  ${inMaintenance}`);

    if (certs.length > 0) {
        console.log("");
        console.log("─── Certificate Health ───────────────────────────");

        const widths = [22, 13, 12, 20];
        logger.tableRow(["DOMAIN", "EXPIRES", "DAYS LEFT", "STATUS"], widths);
        const sep = widths.map((w) => "─".repeat(w)).join("  ");
        console.log(sep);

        for (const cert of certs) {
            logger.tableRow(
                [cert.domain, cert.expires, String(cert.daysLeft ?? "N/A"), cert.status],
                widths,
            );
        }
    }

    console.log("");
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if nginx is running by reading its PID file.
 *
 * @param shell - Shell executor.
 * @returns Object with running status and optional PID.
 */
function checkNginx(_shell: Shell): { running: boolean; pid?: number } {
    try {
        if (fs.existsSync("/run/nginx.pid")) {
            const pidStr = fs.readFileSync("/run/nginx.pid", "utf-8").trim();
            const pid = parseInt(pidStr, 10);
            // Verify process exists by sending signal 0.
            process.kill(pid, 0);
            return { running: true, pid };
        }
    } catch {
        // Process doesn't exist or no permissions.
    }
    return { running: false };
}

/**
 * Get a version string from a command.
 *
 * @param shell   - Shell executor.
 * @param command - Command to run.
 * @returns Version string or "N/A".
 */
function getVersion(shell: Shell, command: string): string {
    try {
        const result = shell.exec(command, { fatal: false, silent: true });
        return result.success ? (result.stdout.trim() || result.stderr.trim() || "N/A") : "N/A";
    } catch {
        return "N/A";
    }
}

/**
 * Calculate days remaining from an ISO date string.
 *
 * @param dateStr - Date in YYYY-MM-DD format or "N/A".
 * @returns Number of days remaining, or null.
 */
function calculateDaysLeft(dateStr: string): number | null {
    if (dateStr === "N/A") return null;
    const expiry = new Date(dateStr);
    if (isNaN(expiry.getTime())) return null;
    return Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Get the certificate status indicator based on days remaining.
 *
 * @param daysLeft - Days until expiry.
 * @param staging  - Whether the cert is from staging.
 * @returns Status string with icon.
 */
function getCertStatus(daysLeft: number | null, staging: boolean): string {
    if (staging) return "⚠ Staging cert";
    if (daysLeft === null) return "? Unknown";
    if (daysLeft < 0) return "✗ Expired";
    if (daysLeft < 15) return "⚠ Expiring very soon";
    if (daysLeft < 30) return "⚠ Expiring soon";
    return "✓ OK";
}
