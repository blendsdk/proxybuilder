/**
 * Cron job management for automatic certificate renewal.
 *
 * Manages crontab entries for the `proxybuilder renew` command.
 * The cron job runs daily at 3 AM to check and renew expiring
 * certificates via certbot.
 *
 * @packageDocumentation
 */

import { CRON_SCHEDULE } from "./constants";
import { Logger } from "./logger";
import { Shell } from "./shell";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Marker comment appended to the crontab entry.
 *
 * Used to identify proxybuilder-managed cron jobs when checking for
 * duplicates or removing entries. Without this marker, we'd have to
 * match the entire command string which is fragile.
 */
const CRON_MARKER = "# proxybuilder-auto-renew";

// ---------------------------------------------------------------------------
// Cron Manager
// ---------------------------------------------------------------------------

/**
 * Install a cron job for automatic certificate renewal.
 *
 * Adds an entry to the current user's crontab that runs
 * `proxybuilder renew --target <target>` on the configured schedule.
 * Checks for existing entries to prevent duplicates.
 *
 * @param target - Absolute path to the proxybuilder data directory.
 * @param shell  - Shell executor for running crontab commands.
 * @param logger - Logger for status output.
 */
export function installCronJob(target: string, shell: Shell, logger: Logger): void {
    // Build the cron entry — schedule + command + marker comment.
    const cronCommand = `proxybuilder renew --target ${target}`;
    const cronEntry = `${CRON_SCHEDULE} ${cronCommand} ${CRON_MARKER}`;

    // Check if a proxybuilder cron job already exists.
    if (cronJobExists(shell)) {
        logger.info("Cron job already installed — skipping");
        return;
    }

    // Append the new entry to the existing crontab.
    // Read current crontab (ignore errors if empty/none), append our line.
    const currentCrontab = getCurrentCrontab(shell);
    const newCrontab = currentCrontab
        ? `${currentCrontab}\n${cronEntry}\n`
        : `${cronEntry}\n`;

    // Write the updated crontab via stdin pipe.
    // We use a temp file approach since piping is unreliable in Shell.exec().
    shell.exec(`echo '${newCrontab.replace(/'/g, "'\\''")}' | crontab -`, { fatal: false });
    logger.success(`Cron job installed: ${CRON_SCHEDULE} ${cronCommand}`);
}

/**
 * Remove the proxybuilder cron job from the current user's crontab.
 *
 * Filters out any lines containing the proxybuilder marker comment.
 * Safe to call even if no cron job exists.
 *
 * @param shell  - Shell executor for running crontab commands.
 * @param logger - Logger for status output.
 */
export function removeCronJob(shell: Shell, logger: Logger): void {
    const currentCrontab = getCurrentCrontab(shell);

    if (!currentCrontab) {
        logger.debug("No crontab entries found — nothing to remove");
        return;
    }

    // Filter out lines that contain our marker.
    const lines = currentCrontab.split("\n");
    const filtered = lines.filter((line) => !line.includes(CRON_MARKER));

    if (lines.length === filtered.length) {
        logger.debug("No proxybuilder cron job found — nothing to remove");
        return;
    }

    const newCrontab = filtered.join("\n").trim();

    if (newCrontab) {
        shell.exec(`echo '${newCrontab.replace(/'/g, "'\\''")}' | crontab -`, { fatal: false });
    } else {
        // No entries left — remove the crontab entirely.
        shell.exec("crontab -r", { fatal: false });
    }

    logger.success("Cron job removed");
}

/**
 * Check whether a proxybuilder cron job is already installed.
 *
 * @param shell - Shell executor for running crontab commands.
 * @returns true if a cron entry with the proxybuilder marker exists.
 */
export function cronJobExists(shell: Shell): boolean {
    const crontab = getCurrentCrontab(shell);
    return crontab.includes(CRON_MARKER);
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Read the current user's crontab content.
 *
 * Returns an empty string if no crontab exists (crontab -l exits
 * non-zero when there are no entries).
 *
 * @param shell - Shell executor.
 * @returns The crontab content or empty string.
 */
function getCurrentCrontab(shell: Shell): string {
    const result = shell.exec("crontab -l", { fatal: false, silent: true });
    // crontab -l returns non-zero when no crontab exists.
    return result.success ? result.stdout.trim() : "";
}
