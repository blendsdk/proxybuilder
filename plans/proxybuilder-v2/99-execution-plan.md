# Execution Plan: Proxybuilder v2

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-03-24 03:27
> **Progress**: 24/42 tasks (57%)

## Overview

Complete reimplementation of the nginx reverse proxy configuration builder CLI tool, renamed from `@truesoftware/proxybuilder` to `@blendsdk/proxybuilder`. Includes new project scaffold, core infrastructure, 14 CLI commands, DNS provider integrations, nginx templates for passthrough and full modes, cron-based auto-renewal, and comprehensive documentation.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                        | Sessions | Est. Time |
| ----- | ---------------------------- | -------- | --------- |
| 1     | Branch Setup & Project Scaffold | 1     | 30 min    |
| 2     | Core Infrastructure          | 1-2      | 90 min    |
| 3     | Template Engine & Templates  | 1        | 60 min    |
| 4     | Setup & Init Commands        | 1        | 60 min    |
| 5     | Lifecycle Commands           | 1-2      | 90 min    |
| 6     | SSL & DNS Commands           | 1-2      | 90 min    |
| 7     | Ops Commands & Cron          | 1        | 45 min    |
| 8     | README & Documentation       | 1        | 60 min    |

**Total: 8-11 sessions, ~8-9 hours**

---

## Phase 1: Branch Setup & Project Scaffold

### Session 1.1: Create v2 Branch and Scaffold Project

**⚠️ Session Execution Rules:**
- Continue implementing until 90% of the 200K context window is reached.
- If 90% reached: wrap up, commit via `gitcmp`, then `/compact`.
- Split large files into smaller, logically grouped files.
- Max AI output: 60K tokens. Max AI input: 200K tokens.

**Reference**: [03-01-project-scaffold.md](03-01-project-scaffold.md)
**Objective**: Create v2 branch, clean up v1 files, scaffold new project structure

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 1.1.1 | Create `v2` git branch | git |
| 1.1.2 | Remove v1 files (lerna.json, publish.sh, packages/) | filesystem |
| 1.1.3 | Create new `package.json` (@blendsdk/proxybuilder) | `package.json` |
| 1.1.4 | Create new `tsconfig.json` (strict mode) | `tsconfig.json` |
| 1.1.5 | Update `.gitignore` | `.gitignore` |
| 1.1.6 | Create directory scaffold (src/, src/commands/, src/templates/, src/dns/) | filesystem |
| 1.1.7 | Install dependencies (`yarn install`) | terminal |
| 1.1.8 | Verify build works (`yarn build`) — empty project, zero errors | terminal |

**Deliverables**:
- [ ] v2 branch created
- [ ] v1 files removed
- [ ] New package.json, tsconfig.json, .gitignore in place
- [ ] `yarn build` succeeds

**Verify**: `clear && yarn build`

---

## Phase 2: Core Infrastructure

### Session 2.1: Types, Constants, Logger, Shell, Validator, Config

**⚠️ Session Execution Rules:**
- Continue implementing until 90% of the 200K context window is reached.
- If 90% reached: wrap up, commit via `gitcmp`, then `/compact`.
- Split large files into smaller, logically grouped files.
- Max AI output: 60K tokens. Max AI input: 200K tokens.

**Reference**: [03-02-core-infra.md](03-02-core-infra.md)
**Objective**: Build all foundational modules that commands depend on

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 2.1.1 | Create type definitions | `src/types.ts` |
| 2.1.2 | Create constants | `src/constants.ts` |
| 2.1.3 | Implement Logger class | `src/logger.ts` |
| 2.1.4 | Implement Shell executor | `src/shell.ts` |
| 2.1.5 | Implement Validator | `src/validator.ts` |
| 2.1.6 | Implement ConfigManager | `src/config.ts` |
| 2.1.7 | Create CLI entry point with global options | `src/index.ts` |
| 2.1.8 | Verify build and `--help` output | terminal |

**Deliverables**:
- [ ] All core modules implemented
- [ ] CLI shows help with global options
- [ ] `yarn build` succeeds with zero errors

**Verify**: `clear && yarn build`

---

## Phase 3: Template Engine & Templates

### Session 3.1: Template Rendering and All Nginx Templates

**⚠️ Session Execution Rules:**
- Continue implementing until 90% of the 200K context window is reached.
- If 90% reached: wrap up, commit via `gitcmp`, then `/compact`.
- Split large files into smaller, logically grouped files.
- Max AI output: 60K tokens. Max AI input: 200K tokens.

**Reference**: [03-03-template-engine.md](03-03-template-engine.md)
**Objective**: Implement template engine and create all nginx config templates + HTML pages

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 3.1.1 | Implement renderTemplate function | `src/template.ts` |
| 3.1.2 | Implement helper functions (generateUpstreamServers, etc.) | `src/template.ts` |
| 3.1.3 | Create shared templates (nginx.conf, proxy.conf, letsencrypt.conf, maintenance.conf) | `src/templates/*.conf` |
| 3.1.4 | Create passthrough mode templates (site.conf, upstream.conf, ssl.conf) | `src/templates/passthrough/*.conf` |
| 3.1.5 | Create full mode templates (site.conf, upstream.conf, ssl.conf, security.conf, general.conf, log.conf) | `src/templates/full/*.conf` |
| 3.1.6 | Create HTML pages (maintenance.html, 502.html) | `src/templates/pages/*.html` |
| 3.1.7 | Update build script to copy templates to dist | `package.json` |
| 3.1.8 | Verify templates are in dist after build | terminal |

**Deliverables**:
- [ ] Template engine implemented
- [ ] All nginx templates created
- [ ] HTML pages created
- [ ] Templates present in `dist/templates/` after build

**Verify**: `clear && yarn build`

---

## Phase 4: Setup & Init Commands

### Session 4.1: Setup and Init Command Handlers

**⚠️ Session Execution Rules:**
- Continue implementing until 90% of the 200K context window is reached.
- If 90% reached: wrap up, commit via `gitcmp`, then `/compact`.
- Split large files into smaller, logically grouped files.
- Max AI output: 60K tokens. Max AI input: 200K tokens.

**Reference**: [03-04-commands-setup-init.md](03-04-commands-setup-init.md)
**Objective**: Implement setup and init commands

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 4.1.1 | Implement `setup` command (system prereqs installation) | `src/commands/setup.ts` |
| 4.1.2 | Implement `init` command (directory structure, DH params, nginx.conf) | `src/commands/init.ts` |
| 4.1.3 | Implement cron job installation helper | `src/cron.ts` |
| 4.1.4 | Implement core ProxyBuilder class (init, folder creation, nginx config) | `src/builder.ts` |
| 4.1.5 | Verify build and command help output | terminal |

**Deliverables**:
- [ ] `setup` command implemented
- [ ] `init` command implemented
- [ ] ProxyBuilder core initialized
- [ ] `yarn build` succeeds

**Verify**: `clear && yarn build`

---

## Phase 5: Lifecycle Commands

### Session 5.1: Create, Delete, Enable, Disable, Update, List

**⚠️ Session Execution Rules:**
- Continue implementing until 90% of the 200K context window is reached.
- If 90% reached: wrap up, commit via `gitcmp`, then `/compact`.
- Split large files into smaller, logically grouped files.
- Max AI output: 60K tokens. Max AI input: 200K tokens.

**Reference**: [03-05-commands-lifecycle.md](03-05-commands-lifecycle.md)
**Objective**: Implement all domain lifecycle commands

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 5.1.1 | Implement `create` command (domain creation with cert + config) | `src/commands/create.ts` |
| 5.1.2 | Add ProxyBuilder methods for cert request and site rendering | `src/builder.ts` |
| 5.1.3 | Implement `delete` command (full cleanup) | `src/commands/delete.ts` |
| 5.1.4 | Implement `enable` command | `src/commands/enable.ts` |
| 5.1.5 | Implement `disable` command | `src/commands/disable.ts` |
| 5.1.6 | Implement `update` command (upstream/mode changes) | `src/commands/update.ts` |
| 5.1.7 | Implement `list` command (table + JSON output) | `src/commands/list.ts` |
| 5.1.8 | Verify build | terminal |

**Deliverables**:
- [ ] All 6 lifecycle commands implemented
- [ ] ProxyBuilder handles cert provisioning and config rendering
- [ ] `yarn build` succeeds

**Verify**: `clear && yarn build`

---

## Phase 6: SSL & DNS Commands

### Session 6.1: Renew, Revoke, Cert-Info, DNS-Setup, DNS Providers

**⚠️ Session Execution Rules:**
- Continue implementing until 90% of the 200K context window is reached.
- If 90% reached: wrap up, commit via `gitcmp`, then `/compact`.
- Split large files into smaller, logically grouped files.
- Max AI output: 60K tokens. Max AI input: 200K tokens.

**Reference**: [03-06-commands-ssl.md](03-06-commands-ssl.md), [03-08-dns-providers.md](03-08-dns-providers.md)
**Objective**: Implement SSL commands and DNS provider integrations

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 6.1.1 | Implement `renew` command (webroot + DNS-01) | `src/commands/renew.ts` |
| 6.1.2 | Implement `revoke` command | `src/commands/revoke.ts` |
| 6.1.3 | Implement `cert-info` command | `src/commands/cert-info.ts` |
| 6.1.4 | Implement DNS provider interface and registry | `src/dns/provider.ts` |
| 6.1.5 | Implement ClouDNS provider | `src/dns/cloudns.ts` |
| 6.1.6 | Implement Namecheap provider | `src/dns/namecheap.ts` |
| 6.1.7 | Implement `dns-setup` command | `src/commands/dns-setup.ts` |
| 6.1.8 | Implement internal `dns-challenge` command (certbot hook callback) | `src/commands/dns-challenge.ts` |
| 6.1.9 | Verify build | terminal |

**Deliverables**:
- [ ] All SSL commands implemented
- [ ] ClouDNS and Namecheap providers implemented
- [ ] DNS hook scripts generated correctly
- [ ] `yarn build` succeeds

**Verify**: `clear && yarn build`

---

## Phase 7: Ops Commands & Cron

### Session 7.1: Maintenance, Status

**⚠️ Session Execution Rules:**
- Continue implementing until 90% of the 200K context window is reached.
- If 90% reached: wrap up, commit via `gitcmp`, then `/compact`.
- Split large files into smaller, logically grouped files.
- Max AI output: 60K tokens. Max AI input: 200K tokens.

**Reference**: [03-07-commands-ops.md](03-07-commands-ops.md), [03-09-cron-renewal.md](03-09-cron-renewal.md)
**Objective**: Implement maintenance mode, status command, and verify cron integration

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 7.1.1 | Implement `maintenance` command (on/off/status) | `src/commands/maintenance.ts` |
| 7.1.2 | Implement `status` command (health overview) | `src/commands/status.ts` |
| 7.1.3 | Verify all 14 commands show in `--help` | terminal |
| 7.1.4 | Verify build | terminal |

**Deliverables**:
- [ ] Maintenance command works (file-based flag)
- [ ] Status command shows comprehensive health info
- [ ] All 14 commands registered and showing in help
- [ ] `yarn build` succeeds

**Verify**: `clear && yarn build`

---

## Phase 8: README & Documentation

### Session 8.1: Comprehensive README

**⚠️ Session Execution Rules:**
- Continue implementing until 90% of the 200K context window is reached.
- If 90% reached: wrap up, commit via `gitcmp`, then `/compact`.
- Split large files into smaller, logically grouped files.
- Max AI output: 60K tokens. Max AI input: 200K tokens.

**Reference**: [03-10-readme.md](03-10-readme.md)
**Objective**: Write comprehensive README with all sections

**Tasks**:

| #     | Task | File |
| ----- | ---- | ---- |
| 8.1.1 | Write README: title, overview, architecture diagram, features | `README.md` |
| 8.1.2 | Write README: quick start, prerequisites, installation | `README.md` |
| 8.1.3 | Write README: command reference (all 14 commands) | `README.md` |
| 8.1.4 | Write README: proxy modes, wildcard certs, load balancing | `README.md` |
| 8.1.5 | Write README: maintenance mode, staging, config file, dir structure | `README.md` |
| 8.1.6 | Write README: troubleshooting, migration from v1, license | `README.md` |
| 8.1.7 | Update .clinerules/project.md for v2 | `.clinerules/project.md` |

**Deliverables**:
- [ ] Complete README.md
- [ ] Updated project.md
- [ ] Final build verification

**Verify**: `clear && yarn build`

---

## Task Checklist (All Phases)

### Phase 1: Branch Setup & Project Scaffold ✅
- [x] 1.1.1 Create `v2` git branch ✅ (completed: 2026-03-23 17:54)
- [x] 1.1.2 Remove v1 files (lerna.json, publish.sh, packages/) ✅ (completed: 2026-03-23 17:54)
- [x] 1.1.3 Create new `package.json` ✅ (completed: 2026-03-23 17:58)
- [x] 1.1.4 Create new `tsconfig.json` ✅ (completed: 2026-03-23 17:58)
- [x] 1.1.5 Update `.gitignore` ✅ (completed: 2026-03-23 17:58)
- [x] 1.1.6 Create directory scaffold ✅ (completed: 2026-03-23 17:56)
- [x] 1.1.7 Install dependencies ✅ (completed: 2026-03-23 17:56)
- [x] 1.1.8 Verify build works ✅ (completed: 2026-03-23 17:57)

### Phase 2: Core Infrastructure ✅
- [x] 2.1.1 Create type definitions ✅ (completed: 2026-03-24 03:16)
- [x] 2.1.2 Create constants ✅ (completed: 2026-03-24 03:17)
- [x] 2.1.3 Implement Logger class ✅ (completed: 2026-03-24 03:18)
- [x] 2.1.4 Implement Shell executor ✅ (completed: 2026-03-24 03:18)
- [x] 2.1.5 Implement Validator ✅ (completed: 2026-03-24 03:19)
- [x] 2.1.6 Implement ConfigManager ✅ (completed: 2026-03-24 03:20)
- [x] 2.1.7 Create CLI entry point ✅ (completed: 2026-03-23 17:58 — carried from Phase 1)
- [x] 2.1.8 Verify build and help output ✅ (completed: 2026-03-24 03:21)

### Phase 3: Template Engine & Templates ✅
- [x] 3.1.1 Implement renderTemplate function ✅ (completed: 2026-03-24 03:23)
- [x] 3.1.2 Implement helper functions ✅ (completed: 2026-03-24 03:23)
- [x] 3.1.3 Create shared templates ✅ (completed: 2026-03-24 03:24)
- [x] 3.1.4 Create passthrough mode templates ✅ (completed: 2026-03-24 03:25)
- [x] 3.1.5 Create full mode templates ✅ (completed: 2026-03-24 03:26)
- [x] 3.1.6 Create HTML pages ✅ (completed: 2026-03-24 03:26)
- [x] 3.1.7 Update build script ✅ (completed: 2026-03-24 03:27)
- [x] 3.1.8 Verify templates in dist ✅ (completed: 2026-03-24 03:27)

### Phase 4: Setup & Init Commands
- [ ] 4.1.1 Implement `setup` command
- [ ] 4.1.2 Implement `init` command
- [ ] 4.1.3 Implement cron helper
- [ ] 4.1.4 Implement ProxyBuilder core
- [ ] 4.1.5 Verify build

### Phase 5: Lifecycle Commands
- [ ] 5.1.1 Implement `create` command
- [ ] 5.1.2 Add ProxyBuilder cert/config methods
- [ ] 5.1.3 Implement `delete` command
- [ ] 5.1.4 Implement `enable` command
- [ ] 5.1.5 Implement `disable` command
- [ ] 5.1.6 Implement `update` command
- [ ] 5.1.7 Implement `list` command
- [ ] 5.1.8 Verify build

### Phase 6: SSL & DNS Commands
- [ ] 6.1.1 Implement `renew` command
- [ ] 6.1.2 Implement `revoke` command
- [ ] 6.1.3 Implement `cert-info` command
- [ ] 6.1.4 Implement DNS provider interface
- [ ] 6.1.5 Implement ClouDNS provider
- [ ] 6.1.6 Implement Namecheap provider
- [ ] 6.1.7 Implement `dns-setup` command
- [ ] 6.1.8 Implement `dns-challenge` command
- [ ] 6.1.9 Verify build

### Phase 7: Ops Commands & Cron
- [ ] 7.1.1 Implement `maintenance` command
- [ ] 7.1.2 Implement `status` command
- [ ] 7.1.3 Verify all commands in help
- [ ] 7.1.4 Verify build

### Phase 8: README & Documentation
- [ ] 8.1.1 Write README: title, overview, architecture, features
- [ ] 8.1.2 Write README: quick start, prereqs, installation
- [ ] 8.1.3 Write README: command reference
- [ ] 8.1.4 Write README: modes, wildcards, load balancing
- [ ] 8.1.5 Write README: maintenance, staging, config, dirs
- [ ] 8.1.6 Write README: troubleshooting, migration, license
- [ ] 8.1.7 Update .clinerules/project.md

---

## Session Protocol

### Starting a Session

1. Start agent settings (if `scripts/agent.sh` exists): run `clear && scripts/agent.sh start`
2. Reference this plan: "Implement Phase X, Session X.X per `plans/proxybuilder-v2/99-execution-plan.md`"

### Ending a Session

1. Run the project's verify command: `clear && yarn build`
2. If verification passes, commit using the `gitcmp` protocol (see `git-commands.md`)
3. End agent settings (if `scripts/agent.sh` exists): run `clear && scripts/agent.sh finished`
4. Compact the conversation with `/compact`

> ⚠️ **Do NOT use raw git commands.** Always use the `gitcm` or `gitcmp` protocol from `git-commands.md`.

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan proxybuilder-v2` to continue

---

## Dependencies

```
Phase 1: Branch Setup & Scaffold
    ↓
Phase 2: Core Infrastructure
    ↓
Phase 3: Template Engine & Templates
    ↓
Phase 4: Setup & Init Commands
    ↓
Phase 5: Lifecycle Commands
    ↓
Phase 6: SSL & DNS Commands
    ↓
Phase 7: Ops Commands & Cron
    ↓
Phase 8: README & Documentation
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`clear && yarn build`)
3. ✅ No warnings/errors
4. ✅ All 14 commands listed in `--help`
5. ✅ README.md is comprehensive
6. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
