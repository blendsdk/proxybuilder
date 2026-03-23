# Proxybuilder v2 — Complete Reimplementation Plan

> **Feature**: Complete reimplementation of the nginx reverse proxy configuration builder CLI tool
> **Status**: Planning Complete
> **Created**: 2026-03-23
> **Package**: `@blendsdk/proxybuilder`

## Overview

Proxybuilder v2 is a complete rewrite of the `@truesoftware/proxybuilder` CLI tool, renamed to `@blendsdk/proxybuilder`. The tool builds and manages nginx reverse proxy configurations on Ubuntu servers, handling SSL certificate provisioning via Let's Encrypt (including wildcard certificates via DNS-01 challenge), domain lifecycle management, upstream load balancing with round-robin, and maintenance mode toggling for CI/CD integration.

The v2 rewrite addresses fundamental architectural issues in v1: the monorepo structure is flattened to a single package, TypeScript strict mode is enabled, proper logging and error handling are added, the proxy is refactored to support both passthrough (SSL termination only) and full (security headers, gzip, etc.) modes, and a comprehensive set of domain lifecycle commands replace the minimal v1 command set.

Key new capabilities include: wildcard SSL certificates via DNS-01 challenge (ClouDNS, Namecheap), multiple upstreams per domain with round-robin load balancing, per-subdomain routing under wildcard certs, maintenance mode toggling without nginx reload, automatic certificate renewal via cron, a system-level `setup` command for prerequisite installation, and a `proxybuilder.json` config file as single source of truth.

## Document Index

| #     | Document                                             | Description                                    |
| ----- | ---------------------------------------------------- | ---------------------------------------------- |
| 00    | [Index](00-index.md)                                 | This document — overview and navigation        |
| 01    | [Requirements](01-requirements.md)                   | Feature requirements and scope                 |
| 02    | [Current State](02-current-state.md)                 | Analysis of v1 implementation                  |
| 03-01 | [Project Scaffold](03-01-project-scaffold.md)        | New project structure, package.json, tsconfig   |
| 03-02 | [Core Infrastructure](03-02-core-infra.md)           | Logger, shell executor, config, validator, types|
| 03-03 | [Template Engine](03-03-template-engine.md)          | Template engine + all nginx templates           |
| 03-04 | [Setup & Init Commands](03-04-commands-setup-init.md)| setup + init commands                           |
| 03-05 | [Lifecycle Commands](03-05-commands-lifecycle.md)     | create, delete, enable, disable, update, list   |
| 03-06 | [SSL Commands](03-06-commands-ssl.md)                | renew, revoke, cert-info, dns-setup             |
| 03-07 | [Ops Commands](03-07-commands-ops.md)                | maintenance, status                             |
| 03-08 | [DNS Providers](03-08-dns-providers.md)              | ClouDNS + Namecheap DNS-01 integration          |
| 03-09 | [Cron Renewal](03-09-cron-renewal.md)                | Auto-renewal cron setup                         |
| 03-10 | [README](03-10-readme.md)                            | README/documentation specification              |
| 07    | [Testing Strategy](07-testing-strategy.md)           | Testing approach and verification               |
| 99    | [Execution Plan](99-execution-plan.md)               | Phases, sessions, and task checklist            |

## Quick Reference

### CLI Usage Examples

```bash
# First-time system setup (installs nginx, certbot, etc.)
sudo proxybuilder setup

# Initialize proxybuilder working directory
proxybuilder init --target /opt/proxybuilder --email info@example.com

# Create a domain with single upstream (passthrough mode)
proxybuilder create --domain api.example.com --upstream 127.0.0.1:3000

# Create with multiple upstreams (round-robin load balancing)
proxybuilder create --domain api.example.com --upstream 127.0.0.1:3000 --upstream 127.0.0.1:3001

# Create a wildcard domain with DNS-01 challenge
proxybuilder create --domain "*.example.com" --upstream 127.0.0.1:8080 --dns-provider cloudns

# Create with full proxy mode (security headers, gzip, etc.)
proxybuilder create --domain app.example.com --upstream 127.0.0.1:4000 --mode full

# Use Let's Encrypt staging for testing
proxybuilder create --domain test.example.com --upstream 127.0.0.1:5000 --staging

# List all domains
proxybuilder list

# Enable/disable a domain
proxybuilder disable --domain api.example.com
proxybuilder enable --domain api.example.com

# Toggle maintenance mode (CI/CD friendly)
proxybuilder maintenance --domain api.example.com --on
proxybuilder maintenance --domain api.example.com --off

# Update upstream(s)
proxybuilder update --domain api.example.com --upstream 127.0.0.1:4000 --upstream 127.0.0.1:4001

# Renew certificates
proxybuilder renew                              # Renew all
proxybuilder renew --domain api.example.com     # Renew specific

# Delete a domain (full cleanup)
proxybuilder delete --domain api.example.com

# Health status
proxybuilder status

# Certificate details
proxybuilder cert-info --domain api.example.com
```

### Key Decisions

| Decision                  | Outcome                                                        |
| ------------------------- | -------------------------------------------------------------- |
| Package name              | `@blendsdk/proxybuilder`                                       |
| CLI binary name           | `proxybuilder`                                                 |
| Default proxy mode        | `passthrough` (SSL termination + routing only)                 |
| Project structure         | Flat single-package (no monorepo tooling)                      |
| Node.js minimum           | Node 20 LTS                                                    |
| ACME client               | certbot (with manual DNS hooks for wildcard certs)             |
| Config file               | `<target>/proxybuilder.json`                                   |
| Maintenance trigger       | File-based flag, toggled via CLI                               |
| DNS providers (v2)        | ClouDNS, Namecheap                                             |
| Let's Encrypt staging     | `--staging` flag on all cert commands                          |
| System setup              | `setup` command installs nginx, certbot, configures firewall   |

## Related Files (v2 — to be created)

```
src/
├── index.ts                 # CLI entry point
├── builder.ts               # Core ProxyBuilder class
├── config.ts                # proxybuilder.json manager
├── logger.ts                # Logging system
├── shell.ts                 # Shell command executor
├── validator.ts             # Input validation
├── types.ts                 # All TypeScript interfaces
├── constants.ts             # Default values, paths
├── commands/                # yargs command handlers
│   ├── setup.ts
│   ├── init.ts
│   ├── create.ts
│   ├── delete.ts
│   ├── enable.ts
│   ├── disable.ts
│   ├── update.ts
│   ├── list.ts
│   ├── renew.ts
│   ├── revoke.ts
│   ├── maintenance.ts
│   ├── status.ts
│   ├── cert-info.ts
│   └── dns-setup.ts
├── templates/               # Nginx config templates
│   ├── nginx.conf
│   ├── proxy.conf
│   ├── letsencrypt.conf
│   ├── maintenance.conf
│   ├── passthrough/
│   │   ├── site.conf
│   │   ├── upstream.conf
│   │   └── ssl.conf
│   ├── full/
│   │   ├── site.conf
│   │   ├── upstream.conf
│   │   ├── ssl.conf
│   │   ├── security.conf
│   │   ├── general.conf
│   │   └── log.conf
│   └── pages/
│       ├── maintenance.html
│       └── 502.html
└── dns/                     # DNS provider integrations
    ├── provider.ts          # IDnsProvider interface
    ├── cloudns.ts
    └── namecheap.ts
```
