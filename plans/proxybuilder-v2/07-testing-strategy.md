# Testing Strategy: Proxybuilder v2

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

Since proxybuilder is an infrastructure tool that manages real nginx configurations and SSL certificates, testing is primarily **manual verification** and **build validation**. There is no unit test framework in this project (out of scope for v2).

### Verification Approach

1. **Build verification** — TypeScript compiles with zero errors under `strict: true`
2. **CLI verification** — All commands parse correctly, `--help` works, `--version` works
3. **Template verification** — Generated nginx configs pass `nginx -t`
4. **Let's Encrypt staging** — All cert operations tested against staging first
5. **Manual end-to-end** — Full workflow on a test server

## Test Categories

### Build Tests

| Test | Description | Priority |
|------|-------------|----------|
| Clean build | `yarn build` completes with zero errors | High |
| Strict TypeScript | No `any` types, all strict checks pass | High |
| Templates copied | `dist/templates/` contains all template files | High |
| CLI entry point | `node dist/index.js --help` shows all commands | High |
| Version flag | `node dist/index.js --version` shows `2.0.0` | Medium |

### CLI Parsing Tests

| Test | Description | Priority |
|------|-------------|----------|
| Unknown command | Rejected with helpful message | High |
| Unknown flag | Rejected with helpful message (strict mode) | High |
| Missing required flag | Error message names the missing flag | High |
| Global flags | `--target`, `--verbose`, `--quiet` accepted on all commands | Medium |
| Command help | Each command's `--help` shows correct flags | Medium |

### Template Rendering Tests

| Test | Description | Priority |
|------|-------------|----------|
| All variables replaced | No `%variable%` remains after rendering | High |
| Unreplaced warning | Logger warns if any placeholders remain | Medium |
| Passthrough mode | Generated config has NO security headers or gzip | High |
| Full mode | Generated config has security headers AND gzip | High |
| Upstream round-robin | Multiple servers in upstream block | High |
| Wildcard server_name | `*.example.com example.com` in server_name | High |
| Maintenance snippet | maintenance.conf includes file check | High |

### End-to-End Tests (Manual, on Test Server)

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Fresh setup | `setup` → `init` → verify | nginx running, dirs created, config valid |
| Create domain (webroot) | `create --domain --upstream --staging` | Cert obtained, site accessible via HTTPS |
| Create domain (DNS-01) | `create --domain "*.x.com" --dns-provider --staging` | Wildcard cert obtained |
| Multiple upstreams | `create --upstream A --upstream B` | Round-robin works |
| List domains | `list` | Table shows all domains correctly |
| Disable/enable | `disable` → verify 404 → `enable` → verify works | Domain toggles correctly |
| Update upstream | `update --upstream newhost:port` | Traffic routes to new upstream |
| Maintenance on/off | `maintenance --on` → verify 503 → `--off` → verify works | No nginx reload needed |
| Custom maint page | Replace maintenance.html → `maintenance --on` | Custom page served |
| Renew cert | `renew --domain --staging` | Cert renewed |
| Delete domain | `delete --domain --force` | All files removed, config cleaned |
| Status | `status` | Shows correct system/domain/cert info |
| Cert info | `cert-info --domain` | Shows cert details |

### Staging Environment Tests

All certificate operations should be tested with `--staging` first:

```bash
# Test create with staging
proxybuilder create --domain test.example.com --upstream 127.0.0.1:3000 --staging

# Test renew with staging
proxybuilder renew --domain test.example.com --staging

# Test wildcard with staging
proxybuilder create --domain "*.example.com" --upstream 127.0.0.1:8080 --dns-provider cloudns --staging
```

Let's Encrypt staging:
- No rate limits
- Issues untrusted certificates (from `(STAGING) Artificial Apricot R3`)
- Same API flow as production
- Ideal for development and testing

## Verification Checklist

- [ ] `yarn build` succeeds with zero errors
- [ ] All 14 commands show correct `--help`
- [ ] `--version` shows correct version
- [ ] Generated passthrough config passes `nginx -t`
- [ ] Generated full config passes `nginx -t`
- [ ] Maintenance mode works without nginx reload
- [ ] Multiple upstreams generate correct upstream block
- [ ] Wildcard domain generates correct server_name
- [ ] Let's Encrypt staging cert can be obtained
- [ ] Cron job is correctly installed
- [ ] README examples match actual CLI interface
