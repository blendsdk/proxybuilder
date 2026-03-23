# Core Infrastructure: Proxybuilder v2

> **Document**: 03-02-core-infra.md
> **Parent**: [Index](00-index.md)

## Overview

This document specifies the core infrastructure modules that all commands depend on: the type system, constants, logger, shell executor, config manager, and validator. These are the foundational building blocks of the application.

## Architecture

### Module Dependency Graph

```
types.ts          ← Pure types, no dependencies
constants.ts      ← Depends on types
logger.ts         ← Depends on types, constants
shell.ts          ← Depends on logger, types
validator.ts      ← Depends on types
config.ts         ← Depends on types, constants, logger, validator
builder.ts        ← Depends on all above
commands/*        ← Depends on builder, config, logger, types
```

## Implementation Details

### `types.ts` — Type Definitions

```typescript
// Proxy mode determines how much the proxy handles
export type ProxyMode = "passthrough" | "full";

// Certificate provisioning method
export type CertMethod = "webroot" | "dns";

// DNS provider names
export type DnsProviderName = "cloudns" | "namecheap";

// Log verbosity levels
export enum LogLevel {
    QUIET = 0,
    ERROR = 1,
    WARN = 2,
    INFO = 3,
    DEBUG = 4,
}

// Domain configuration stored in proxybuilder.json
export interface IDomainConfig {
    proxyMode: ProxyMode;
    upstreams: string[];          // ["127.0.0.1:3000", "127.0.0.1:3001"]
    certMethod: CertMethod;
    dnsProvider?: DnsProviderName;
    enabled: boolean;
    maintenance: boolean;
    wildcard: boolean;
    staging: boolean;             // Whether cert was obtained from staging
    created: string;              // ISO 8601 timestamp
    updated: string;              // ISO 8601 timestamp
}

// Default settings for new domains
export interface IProxyDefaults {
    proxyMode: ProxyMode;
    certMethod: CertMethod;
}

// DNS provider credentials
export interface IDnsCredentials {
    provider: DnsProviderName;
    [key: string]: string;        // Provider-specific fields
}

// Root configuration file (proxybuilder.json)
export interface IProxyConfig {
    version: string;              // Config schema version ("2.0")
    email: string;                // Let's Encrypt contact email
    targetFolder: string;         // Resolved absolute path
    defaults: IProxyDefaults;
    domains: Record<string, IDomainConfig>;
    dns: Record<string, IDnsCredentials>;
}

// Shell command execution result
export interface IShellResult {
    success: boolean;
    code: number;
    stdout: string;
    stderr: string;
    command: string;
}

// Command handler common arguments
export interface ICommonArgs {
    target: string;
    verbose: boolean;
    quiet: boolean;
}

// Domain table row for list command
export interface IDomainTableRow {
    domain: string;
    status: string;       // "enabled" | "disabled"
    mode: string;         // "passthrough" | "full"
    upstreams: string;    // Comma-separated
    certExpiry: string;   // Date or "N/A"
    maintenance: string;  // "on" | "off"
    staging: string;      // "yes" | "no"
}
```

### `constants.ts` — Default Values and Paths

```typescript
import { IProxyDefaults, LogLevel } from "./types";

// Default target folder
export const DEFAULT_TARGET = "/opt/proxybuilder";

// Default Let's Encrypt email (must be overridden by user)
export const DEFAULT_EMAIL = "";

// Default proxy settings
export const DEFAULT_PROXY: IProxyDefaults = {
    proxyMode: "passthrough",
    certMethod: "webroot",
};

// Config file name
export const CONFIG_FILENAME = "proxybuilder.json";

// Config schema version
export const CONFIG_VERSION = "2.0";

// Certbot binary (found via PATH, not hardcoded)
export const CERTBOT_BIN = "certbot";

// Nginx binary
export const NGINX_BIN = "nginx";

// Subfolder names within target
export const FOLDERS = {
    nginx: "nginx",
    proxy: "proxy",
    ssl: "ssl",
    apps: "apps",
    logs: "logs",
    dns: "dns",
    letsencrypt: "letsencrypt",
    sitesEnabled: "nginx/sites-enabled",
    sitesDisabled: "nginx/sites-disabled",
    modulesEnabled: "nginx/modules-enabled",
    confD: "nginx/conf.d",
} as const;

// Cron schedule for auto-renewal (daily at 3 AM)
export const CRON_SCHEDULE = "0 3 * * *";

// Log level default
export const DEFAULT_LOG_LEVEL = LogLevel.INFO;

// Maintenance flag filename
export const MAINTENANCE_FLAG = "maintenance.flag";

// DH param bits
export const DH_PARAM_BITS = 2048;

// Let's Encrypt staging URL (for reference in logs)
export const LE_STAGING_NOTE = "Using Let's Encrypt STAGING environment (certificates will NOT be trusted by browsers)";
```

### `logger.ts` — Logging System

```typescript
import { LogLevel } from "./types";

export class Logger {
    private level: LogLevel;
    private logFile: string | null;

    constructor(level: LogLevel, logFile?: string);

    // Core log method
    private log(level: LogLevel, message: string, context?: Record<string, unknown>): void;

    // Convenience methods
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;

    // Special: log a shell command being executed
    command(cmd: string, cwd?: string): void;

    // Special: log a shell command result
    commandResult(result: IShellResult): void;

    // Write a blank line (for formatting)
    blank(): void;

    // Write a section header
    section(title: string): void;

    // Write a success message (green checkmark)
    success(message: string): void;

    // Write a table row
    tableRow(columns: string[], widths: number[]): void;
}
```

**Console output format:**
```
2026-03-23 14:30:00 [INFO]  Creating proxy for api.example.com
2026-03-23 14:30:00 [DEBUG] Upstream servers: 127.0.0.1:3000, 127.0.0.1:3001
2026-03-23 14:30:01 [CMD]   openssl dhparam -out /opt/proxybuilder/dhparam.pem 2048
2026-03-23 14:30:05 [OK]    Command completed (exit code: 0)
2026-03-23 14:30:05 [WARN]  Certificate expires in 15 days
2026-03-23 14:30:05 [ERROR] Failed to reload nginx: config test failed
```

**Color scheme:**
- `DEBUG` — gray
- `INFO` — default/white
- `CMD` — cyan
- `OK` — green
- `WARN` — yellow
- `ERROR` — red
- Section headers — bold white
- Success checkmarks — green

**File output:** Same format but without ANSI color codes. Appended to `<target>/proxybuilder.log`.

### `shell.ts` — Shell Command Executor

```typescript
import { IShellResult } from "./types";
import { Logger } from "./logger";

export class Shell {
    private logger: Logger;
    private dryRun: boolean;

    constructor(logger: Logger, dryRun: boolean);

    // Execute a shell command
    exec(command: string, options?: {
        cwd?: string;
        sudo?: boolean;
        fatal?: boolean;     // Throw on non-zero exit (default: true)
        silent?: boolean;    // Don't log output (for credential operations)
    }): IShellResult;

    // Check if a binary exists in PATH
    commandExists(binary: string): boolean;

    // Execute and return stdout trimmed
    execCapture(command: string, options?: { cwd?: string }): string;
}
```

**Implementation notes:**
- Uses `child_process.execSync` under the hood
- In dry-run mode: logs the command but doesn't execute, returns success result
- `sudo` option prepends `sudo` to the command
- `fatal` option throws an error with user-friendly message on non-zero exit
- `silent` option suppresses stdout/stderr logging (for commands with credentials)
- All commands are logged via `logger.command()` and `logger.commandResult()`

### `config.ts` — Configuration Manager

```typescript
import { IProxyConfig, IDomainConfig, IDnsCredentials, DnsProviderName } from "./types";
import { Logger } from "./logger";

export class ConfigManager {
    private configPath: string;
    private config: IProxyConfig;
    private logger: Logger;

    constructor(targetFolder: string, logger: Logger);

    // Load config from disk (returns false if doesn't exist)
    load(): boolean;

    // Save config to disk
    save(): void;

    // Create initial config
    create(email: string): void;

    // Check if config exists
    exists(): boolean;

    // Get full config (readonly)
    getConfig(): Readonly<IProxyConfig>;

    // Domain operations
    getDomain(domain: string): IDomainConfig | undefined;
    addDomain(domain: string, config: IDomainConfig): void;
    updateDomain(domain: string, updates: Partial<IDomainConfig>): void;
    removeDomain(domain: string): void;
    listDomains(): Array<{ domain: string; config: IDomainConfig }>;
    domainExists(domain: string): boolean;

    // DNS credential operations
    getDnsCredentials(provider: DnsProviderName): IDnsCredentials | undefined;
    setDnsCredentials(provider: DnsProviderName, credentials: IDnsCredentials): void;

    // Get resolved paths
    getTargetFolder(): string;
    getEmail(): string;
}
```

**Implementation notes:**
- Reads/writes `<target>/proxybuilder.json` with `JSON.stringify(config, null, 2)`
- `load()` validates the config version field
- `save()` writes atomically (write to `.tmp` then rename) to prevent corruption
- All mutating operations call `save()` automatically
- Config file permissions set to 600 (owner read/write only) due to DNS credentials

### `validator.ts` — Input Validation

```typescript
export class Validator {
    // Validate a domain name (including wildcard *.example.com)
    static isValidDomain(domain: string): boolean;

    // Check if domain is a wildcard
    static isWildcard(domain: string): boolean;

    // Validate an upstream address (IP:port or hostname:port)
    static isValidUpstream(upstream: string): boolean;

    // Validate email address (basic check)
    static isValidEmail(email: string): boolean;

    // Check if running as root/sudo
    static isRoot(): boolean;

    // Check if a system command exists
    static commandExists(command: string): boolean;

    // Validate proxy mode
    static isValidProxyMode(mode: string): mode is ProxyMode;

    // Validate cert method
    static isValidCertMethod(method: string): method is CertMethod;

    // Pre-flight check: verify all required tools are installed
    static preflightCheck(requirements: string[]): { ok: boolean; missing: string[] };
}
```

**Domain validation rules:**
- Standard domain: `/^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/`
- Wildcard: `/^\*\.([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/`
- Max length: 253 characters
- Label max length: 63 characters

**Upstream validation rules:**
- Format: `<host>:<port>` where host is IPv4 address or hostname
- Port: 1-65535
- Examples: `127.0.0.1:3000`, `localhost:8080`, `backend.local:443`

### `index.ts` — CLI Entry Point

```typescript
#!/usr/bin/env node
import path from "path";
import yargs from "yargs";

yargs
    .scriptName("proxybuilder")
    .commandDir(path.resolve(path.join(__dirname, "commands")))
    .demandCommand(1, "You must specify a command. Run --help for available commands.")
    .strict()
    .option("t", {
        alias: "target",
        type: "string",
        default: "/opt/proxybuilder",
        description: "Target folder for proxybuilder data",
        global: true,
    })
    .option("verbose", {
        type: "boolean",
        default: false,
        description: "Enable verbose (debug) output",
        global: true,
    })
    .option("quiet", {
        type: "boolean",
        default: false,
        description: "Suppress all output except errors",
        global: true,
    })
    .version()
    .help()
    .alias("h", "help")
    .epilogue("For more information, see: https://github.com/TrueSoftwareNL/nginx-proxy")
    .parse();
```

**Key changes from v1:**
- `demandCommand(1, message)` — helpful error message
- `.strict()` — rejects unknown flags
- Global `--target`, `--verbose`, `--quiet` options
- `.version()` — reads from `package.json`
- `.epilogue()` — link to repo

## Error Handling

| Error Case | Handling Strategy |
| ---------- | ----------------- |
| Config file not found | `load()` returns false; commands check and prompt `init` |
| Config file corrupt JSON | Catch `JSON.parse` error, show file path, suggest manual fix |
| Config version mismatch | Warn and suggest migration |
| Permission denied on file write | Catch EACCES, suggest running with correct user |
| Shell command fails | Log command + stderr, throw with user-friendly message |
| Invalid domain format | Validator rejects before any work starts |
| Invalid upstream format | Validator rejects before any work starts |
| Missing system tool | Pre-flight check fails with list of missing tools |

## Testing Requirements

- Logger outputs correct format with colors (manual verification)
- Shell executor handles success and failure cases
- Config manager CRUD operations work correctly
- Validator accepts/rejects correct inputs
- All modules compile with `strict: true`
