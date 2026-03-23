# Current State: Proxybuilder v1

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

Proxybuilder v1 is a monorepo (Lerna + Yarn Workspaces) containing a single package `@truesoftware/proxybuilder`. It provides 3 CLI commands (`create`, `renew`, `revoke`) using yargs, with a `ProxyBuilder` class that manages nginx config generation and certbot certificate operations.

The tool uses a custom template engine (`renderTemplate` in `lib.ts`) that replaces `%variable%` placeholders in `.conf` template files. Templates are stored in `packages/proxybuilder/resources/`.

### Relevant Files (v1 — to be archived/replaced)

| File | Purpose | v2 Status |
| ---- | ------- | --------- |
| `packages/proxybuilder/src/index.ts` | CLI entry point (yargs) | Replace — flat structure |
| `packages/proxybuilder/src/builder.ts` | ProxyBuilder class — core logic | Replace — rewrite entirely |
| `packages/proxybuilder/src/lib.ts` | Utilities (logging, file ops, template rendering) | Replace — split into logger.ts, shell.ts, etc. |
| `packages/proxybuilder/src/types.ts` | ITargetFolder interface (unused) | Replace — proper types |
| `packages/proxybuilder/src/commands/create.ts` | Create command handler | Replace — new implementation |
| `packages/proxybuilder/src/commands/renew.ts` | Renew command handler | Replace — new implementation |
| `packages/proxybuilder/src/commands/revoke.ts` | Revoke command handler | Replace — new implementation |
| `packages/proxybuilder/resources/*.conf` | Nginx config templates | Replace — new templates with mode support |
| `package.json` (root) | Monorepo root with Lerna scripts | Replace — flat project package.json |
| `lerna.json` | Lerna configuration | Delete |
| `publish.sh` | Dangerous git commit script | Delete |
| `tsconfig.json` (root) | TypeScript config (strict disabled) | Replace — strict enabled |

### Code Analysis

#### `builder.ts` — Core Issues

1. **No error handling** — `executeCommand` throws raw `Error(result.toString())`, bubbles up as unhandled stack trace
2. **`dryRun` parameter naming is misleading** — the parameter means "skippable in dry-run mode", not "this is a dry run"
3. **Hardcoded email** — `info@truesoftware.nl` in `renewCertificate`
4. **Hardcoded certbot path** — `/usr/bin/certbot`
5. **Debug console.log left in** — `console.log({ targetName: this.targetName })` in `init()`
6. **No upstream configuration** — `site-upstream.conf` hardcodes `0.0.0.0:80`
7. **`site-custom.conf` returns JSON instead of proxying** — proxy_pass is commented out
8. **No config persistence** — state only exists in filesystem config files
9. **Class has too many responsibilities** — init, SSL, nginx config, certbot operations all in one class

#### `lib.ts` — Issues

1. **Double `lstatSync` calls** — `symlinkExists`, `folderExists`, `fileExists` all call stat functions twice
2. **`any` types everywhere** — no type safety
3. **Template engine is fragile** — no validation of unreplaced variables
4. **Logging is bare console.log** — no timestamps, no colors, no file output, no verbosity control

#### `types.ts` — Issues

1. **`ITargetFolder` is completely unused** — dead code

#### Command handlers — Issues

1. **`argv: any`** — no type safety
2. **No error handling** — exceptions bubble up as raw stack traces
3. **No input validation** — domain format, upstream format not validated
4. **Inconsistent descriptions** — `create` says "Initialized a new proxy" (typo)

#### `package.json` (proxybuilder) — Issues

1. **`@types/*` in `dependencies`** instead of `devDependencies` — ships type packages to end users
2. **Empty `author` and `keywords`**
3. **Outdated dependencies** — TypeScript 4.7, glob 8, mkdirp 1.x

#### Root `package.json` — Issues

1. **`release-prod` has syntax error** — `&& &&` (double ampersand)
2. **`mkpack` script referenced but doesn't exist**
3. **`publish.sh` is dangerous** — always commits as `fix:`, pollutes conventional commit history

#### `tsconfig.json` — Issues

1. **`strict: true` commented out** — `strictNullChecks`, `strictFunctionTypes`, `strictPropertyInitialization` all `false`
2. **`lib: ["dom"]` included** — unnecessary for a CLI tool
3. **Outdated target** — `es6` could be `es2022` for Node 20

## Gaps Identified

### Gap 1: No Domain Lifecycle Management

**Current Behavior:** Only `create`, `renew`, `revoke` commands exist. No way to list, delete, enable, disable, or update domains.
**Required Behavior:** Full lifecycle management with `list`, `delete`, `enable`, `disable`, `update` commands.
**Fix Required:** Implement all missing commands + `proxybuilder.json` config for state tracking.

### Gap 2: No Wildcard Certificate Support

**Current Behavior:** Only webroot validation (`--webroot`), which cannot do wildcards.
**Required Behavior:** DNS-01 challenge support for `*.example.com` certificates.
**Fix Required:** DNS provider integration (ClouDNS, Namecheap), certbot manual hooks.

### Gap 3: Proxy Does Too Much

**Current Behavior:** Proxy adds security headers, gzip, favicon/robots handling regardless of upstream.
**Required Behavior:** Passthrough mode for upstreams with their own nginx; full mode for bare HTTP apps.
**Fix Required:** Two sets of templates, `--mode` flag, per-domain mode config.

### Gap 4: No Upstream Configuration

**Current Behavior:** Upstream hardcoded to `0.0.0.0:80`, no CLI flag for upstream address.
**Required Behavior:** Configurable upstream(s) per domain with round-robin support.
**Fix Required:** `--upstream` flag (repeatable), upstream block generation in templates.

### Gap 5: No Maintenance Mode

**Current Behavior:** No maintenance capability.
**Required Behavior:** Toggle maintenance per domain without nginx reload, CI/CD friendly.
**Fix Required:** File-based flag + nginx conditional check + maintenance page templates.

### Gap 6: No System Setup

**Current Behavior:** Manual installation steps documented in README.
**Required Behavior:** `setup` command that automates prerequisite installation.
**Fix Required:** New `setup` command with apt/snap operations.

### Gap 7: No Certificate Auto-Renewal

**Current Behavior:** Manual `renew` command only.
**Required Behavior:** Automatic daily renewal via cron.
**Fix Required:** Cron job installation during `init`.

### Gap 8: Poor Logging

**Current Behavior:** Basic `console.log` with `[INFO]`/`[WARN]`/`[ERROR]` prefix.
**Required Behavior:** Color-coded, timestamped, file output, verbosity control, command audit trail.
**Fix Required:** New logger module.

## Dependencies

### Internal Dependencies

- Node.js >= 20 LTS (runtime)
- TypeScript >= 5.x (build-time)
- yargs (CLI framework)

### External Dependencies (system-level)

- nginx (installed via `setup`)
- certbot (installed via `setup`)
- openssl (for DH params, self-signed certs)
- cron (for auto-renewal)
- UFW firewall (optional, configured via `setup`)

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| DNS provider API changes | Low | High | Abstract behind interface, easy to update |
| certbot breaking changes | Low | Medium | Pin to major version, test with staging |
| Template variable collision | Low | Medium | Use unique prefix pattern `%var%`, validate after render |
| Existing v1 installs in production | Medium | High | Document migration path in README, v2 can read v1 configs |
| ClouDNS/Namecheap API rate limits | Low | Medium | Implement retry with backoff in DNS hooks |
| Running without sufficient permissions | High | High | Pre-flight check for sudo/root before operations that need it |
