/**
 * Init command — creates the proxybuilder working directory and configures nginx.
 *
 * This command is the second step after `setup`. It creates the full
 * directory structure, generates SSL materials (DH params + self-signed cert),
 * renders nginx config files, creates the proxybuilder.json config, and
 * optionally installs a cron job for automatic certificate renewal.
 *
 * Designed to be idempotent — safe to run multiple times without side effects.
 *
 * @packageDocumentation
 */

import path from "path";
import { CommandBuilder } from "yargs";

import { ICommonArgs, LogLevel } from "../types";
import { CERTBOT_BIN, NGINX_BIN } from "../constants";
import { Logger } from "../logger";
import { Shell } from "../shell";
import { Validator } from "../validator";
import { ProxyBuilder } from "../builder";
import { installCronJob } from "../cron";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CLI arguments specific to the `init` command. */
interface IInitArgs extends ICommonArgs {
    /** Let's Encrypt contact email address. */
    email: string;
    /** Skip cron job installation when true. */
    "no-cron": boolean;
    /** Show what would happen without executing. */
    "dry-run": boolean;
}

// ---------------------------------------------------------------------------
// Command Export
// ---------------------------------------------------------------------------

/** Yargs command name. */
export const command = "init";

/** Yargs command description shown in `--help`. */
export const desc = "Initialize proxybuilder working directory";

/** Yargs option definitions for the init command. */
export const builder: CommandBuilder = {
    e: {
        alias: "email",
        type: "string",
        demandOption: true,
        description: "Let's Encrypt contact email",
    },
    "no-cron": {
        type: "boolean",
        default: false,
        description: "Skip cron job installation",
    },
    "dry-run": {
        type: "boolean",
        default: false,
        description: "Show what would happen without executing",
    },
};

/**
 * Handler for the `proxybuilder init` command.
 *
 * Orchestrates all initialisation steps in order:
 * 1. Pre-flight checks (email, nginx, certbot, permissions)
 * 2. Create directory structure
 * 3. Generate DH parameters
 * 4. Generate self-signed certificate
 * 5. Render nginx.conf and shared configs
 * 6. Install nginx.conf symlink
 * 7. Create proxybuilder.json
 * 8. Install cron job (unless --no-cron)
 * 9. Test and reload nginx
 *
 * @param argv - Parsed CLI arguments including global options and init-specific flags.
 */
export const handler = (argv: IInitArgs): void => {
    const logLevel = argv.verbose ? LogLevel.DEBUG : argv.quiet ? LogLevel.QUIET : LogLevel.INFO;
    const logger = new Logger(logLevel);
    const dryRun = argv["dry-run"];
    const shell = new Shell(logger, dryRun);
    const target = path.resolve(argv.target);

    logger.section("Proxybuilder Init");
    logger.blank();

    // --- Pre-flight: Validate email ---
    if (!Validator.isValidEmail(argv.email)) {
        logger.error(`Invalid email address: "${argv.email}"`);
        process.exit(1);
    }

    // --- Pre-flight: Check nginx is installed ---
    if (!dryRun && !Validator.commandExists(NGINX_BIN)) {
        logger.error(`${NGINX_BIN} not found. Run 'sudo proxybuilder setup' first.`);
        process.exit(1);
    }

    // --- Pre-flight: Check certbot is installed ---
    if (!dryRun && !Validator.commandExists(CERTBOT_BIN)) {
        logger.error(`${CERTBOT_BIN} not found. Run 'sudo proxybuilder setup' first.`);
        process.exit(1);
    }

    logger.info(`Target directory: ${target}`);
    logger.info(`Email: ${argv.email}`);
    logger.info(`Dry run: ${dryRun ? "yes" : "no"}`);
    logger.info(`Cron: ${argv["no-cron"] ? "skip" : "install"}`);
    logger.blank();

    // Create the ProxyBuilder instance — this is the engine for all operations.
    const builder = new ProxyBuilder(target, logger, shell);

    // Step 1: Create directory structure.
    builder.createDirectoryStructure();
    logger.blank();

    // Step 2: Generate DH parameters (slow, ~30-60 seconds).
    builder.generateDhParams();
    logger.blank();

    // Step 3: Generate self-signed certificate for the default server.
    builder.generateSelfSignedCert();
    logger.blank();

    // Step 4: Render shared nginx configs.
    builder.renderSharedConfigs();
    logger.blank();

    // Step 5: Install nginx.conf symlink.
    builder.installNginxSymlink();
    logger.blank();

    // Step 6: Create proxybuilder.json config file.
    logger.section("Creating configuration file");
    const isNew = builder.initConfig(argv.email);
    if (isNew) {
        logger.success("Configuration file created");
    } else {
        logger.info("Configuration file already exists — validated version");
    }
    logger.blank();

    // Step 7: Install cron job (unless --no-cron).
    if (!argv["no-cron"]) {
        logger.section("Installing cron job");
        installCronJob(target, shell, logger);
    } else {
        logger.info("Cron job installation skipped (--no-cron)");
    }
    logger.blank();

    // Step 8: Test nginx config and reload.
    const configOk = builder.testNginxConfig();
    if (configOk) {
        builder.reloadNginx();
    } else {
        logger.warn("nginx config test failed — skipping reload");
        logger.warn("Fix the configuration and run 'nginx -t' manually");
    }
    logger.blank();

    // --- Summary ---
    logger.section("Init Complete");
    logger.success("Proxybuilder initialized successfully!");
    logger.info(`Target: ${target}`);
    logger.info(`Config: ${builder.getConfigPath()}`);
    logger.blank();
    logger.info("Next steps:");
    logger.info("  proxybuilder create example.com --upstream 127.0.0.1:3000");
    logger.info("  proxybuilder list");
};
