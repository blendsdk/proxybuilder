# Requirements: Proxybuilder v2

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Proxybuilder v2 is a complete reimplementation of the nginx reverse proxy configuration builder CLI tool. It manages the full lifecycle of domain-based reverse proxy configurations on Ubuntu servers, including SSL certificate provisioning via Let's Encrypt, upstream load balancing, and operational features like maintenance mode.

The tool is designed for operators who run multiple web applications behind a single nginx reverse proxy, where each application may have its own nginx or HTTP server. The proxy handles SSL termination and routes traffic to the correct upstream based on domain name.

## Functional Requirements

### Must Have

- [ ] **System setup** (`setup`) — Install and configure nginx, certbot, firewall rules, and other prerequisites on a fresh Ubuntu server
- [ ] **Initialization** (`init`) — Create the proxybuilder working directory structure, generate DH params, self-signed certs, main nginx.conf, install cron job
- [ ] **Domain creation** (`create`) — Add a domain with upstream address(es), proxy mode, and SSL certificate
- [ ] **Domain deletion** (`delete`) — Full cleanup: revoke cert, remove all configs, remove from proxybuilder.json
- [ ] **Domain enable/disable** (`enable`/`disable`) — Toggle a domain on/off without destroying config
- [ ] **Domain update** (`update`) — Modify upstream(s), proxy mode for an existing domain
- [ ] **Domain listing** (`list`) — Table view of all domains with status, mode, upstreams, cert expiry, maintenance state
- [ ] **Certificate renewal** (`renew`) — Renew certificate(s) for one or all domains
- [ ] **Certificate revocation** (`revoke`) — Revoke a domain's certificate
- [ ] **Maintenance mode** (`maintenance`) — Toggle maintenance mode per domain via file flag (no nginx reload)
- [ ] **Passthrough proxy mode** — SSL termination + routing only (no security headers, no gzip)
- [ ] **Full proxy mode** — SSL termination + security headers, gzip, logging (for bare HTTP apps)
- [ ] **Multiple upstreams** — Round-robin load balancing via nginx upstream blocks
- [ ] **Wildcard SSL certificates** — DNS-01 challenge for `*.example.com` domains
- [ ] **DNS provider integration** — ClouDNS and Namecheap API for DNS-01 challenge
- [ ] **Let's Encrypt staging** — `--staging` flag for testing without rate limits
- [ ] **Auto-renewal** — Cron job for daily certificate renewal checks
- [ ] **Configuration file** — `proxybuilder.json` as single source of truth for all domain state
- [ ] **Proper logging** — Color-coded, timestamped, with verbosity control and file output
- [ ] **Error handling** — User-friendly messages, proper exit codes, input validation
- [ ] **Comprehensive README** — Full documentation with examples, architecture, troubleshooting

### Should Have

- [ ] **Health status** (`status`) — Overview of nginx state, cert expiry warnings, upstream reachability
- [ ] **Certificate info** (`cert-info`) — Show certificate details for a domain
- [ ] **DNS setup** (`dns-setup`) — Interactive credential configuration for DNS providers
- [ ] **Custom maintenance page** — Per-domain custom HTML, fallback to built-in default
- [ ] **Dry-run mode** — `--dry-run` flag to show what would happen without executing
- [ ] **Per-subdomain routing** — Different upstreams for different subdomains under a wildcard cert
- [ ] **`--version` flag** — Show installed version
- [ ] **`--force` flag on delete** — Skip confirmation prompt for automation

### Won't Have (Out of Scope for v2)

- HTTP REST API for remote management
- Web GUI / dashboard
- Docker containerization of proxybuilder itself
- DNS providers beyond ClouDNS and Namecheap (architecture supports future additions)
- Backup/restore commands
- Unit test suite (no test framework; focus on functional tool first)
- Windows/macOS support (Ubuntu/Debian only)
- HTTP/3 (QUIC) support
- Rate limiting configuration
- Geographic load balancing

## Technical Requirements

### Platform

- Ubuntu/Debian Linux (tested on Ubuntu 22.04+)
- Node.js >= 20 LTS
- nginx (installed via `setup` command)
- certbot (installed via `setup` command)

### Performance

- All commands should complete within 60 seconds (except cert provisioning which depends on ACME)
- nginx reload should happen only when config changes, not on maintenance toggle
- Template rendering should be fast (file I/O, string replacement)

### Compatibility

- Must work alongside existing nginx installations (symlinks main config)
- Must not interfere with manually configured nginx sites outside proxybuilder's scope
- Upstream apps can be any HTTP server (nginx, Node.js, Python, Go, etc.)

### Security

- DNS provider credentials stored with restricted file permissions (600)
- DH params generated at 2048-bit minimum
- SSL follows Mozilla Intermediate configuration
- No secrets in CLI output or logs (mask credentials)
- `setup` command requires root/sudo

## Scope Decisions

| Decision                 | Options Considered                          | Chosen              | Rationale                                                    |
| ------------------------ | ------------------------------------------- | ------------------- | ------------------------------------------------------------ |
| Package name             | `@truesoftware/proxybuilder`, `@blendsdk/proxybuilder` | `@blendsdk/proxybuilder` | User preference, aligns with BlendSDK ecosystem              |
| Project structure        | Monorepo (Lerna/Turbo), flat single package | Flat single package | Only one package, no monorepo overhead needed                |
| Default proxy mode       | passthrough, full                           | passthrough         | Primary use case: upstream apps have their own nginx          |
| ACME client              | certbot, acme.sh, lego                      | certbot             | Already used in v1, well-documented, manual hooks for DNS-01  |
| Node.js minimum          | 18 LTS, 20 LTS                              | 20 LTS              | Modern built-ins (fs.globSync), Node 18 EOL April 2025       |
| Config storage           | Target folder, fixed path, env vars         | Target folder       | Self-contained, portable                                      |
| Maintenance mechanism    | File flag, config toggle, nginx var         | File flag           | No reload needed, simple, CI/CD friendly                      |
| DNS providers            | Cloudflare, Route53, ClouDNS, Namecheap    | ClouDNS + Namecheap | User's actual providers; plugin arch for future additions     |
| Replace shelljs          | child_process.execSync, execa               | child_process       | No extra dependency, sufficient for our needs                 |
| Replace mkdirp           | fs.mkdirSync recursive, mkdirp              | fs.mkdirSync        | Built-in since Node 10                                        |
| Replace glob             | fs.globSync (Node 22+), fast-glob, manual   | fast-glob or readdir| Node 20 doesn't have globSync; use fast-glob or manual readdir |

## Acceptance Criteria

1. [ ] All 14 commands implemented and working
2. [ ] Passthrough mode creates minimal proxy config (SSL termination + routing only)
3. [ ] Full mode creates proxy config with security headers, gzip, logging
4. [ ] Multiple upstreams per domain with round-robin works correctly
5. [ ] Wildcard certificates obtainable via DNS-01 challenge (ClouDNS, Namecheap)
6. [ ] `--staging` flag uses Let's Encrypt staging environment
7. [ ] Maintenance mode toggleable without nginx reload
8. [ ] Custom maintenance page served when present, fallback to default
9. [ ] Cron job auto-renews certificates daily
10. [ ] `proxybuilder.json` accurately reflects all domain state
11. [ ] Logging is color-coded, timestamped, with `--verbose`/`--quiet` support
12. [ ] All errors produce user-friendly messages with proper exit codes
13. [ ] README covers all features with examples
14. [ ] `setup` command installs all prerequisites on a fresh Ubuntu server
15. [ ] Clean build with `yarn build` (zero TypeScript errors)
