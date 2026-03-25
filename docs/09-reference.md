# 09 — Reference

> Directory structure, configuration file schema, global CLI options, troubleshooting, and command quick reference.

[← Back to Index](00-index.md) · [Previous: Monitoring & Status](08-monitoring-and-status.md)

---

## Directory Structure

After running `proxybuilder init`, the following directory tree is created at the target path (default: `/opt/proxybuilder`):

```
/opt/proxybuilder/
│
├── proxybuilder.json               # Configuration file (single source of truth)
├── dhparam.pem                     # Diffie-Hellman parameters (2048-bit)
│
├── nginx/
│   ├── nginx.conf                  # Main nginx config (symlinked to /etc/nginx/)
│   ├── sites-enabled/              # Active domain configs (one .conf per domain)
│   ├── sites-disabled/             # Disabled domain configs (preserved for re-enabling)
│   ├── modules-enabled/            # Nginx modules
│   └── conf.d/                     # Additional config fragments
│
├── proxy/
│   ├── proxy.conf                  # Shared proxy headers (included by all domains)
│   └── letsencrypt.conf            # ACME challenge location block
│
├── ssl/
│   ├── self-ssl.key                # Self-signed private key (default server fallback)
│   └── self-ssl.crt                # Self-signed certificate (default server fallback)
│
├── apps/
│   └── <domain>/                   # One folder per domain
│       ├── site.conf               # Main site config (server block)
│       ├── upstream.conf           # Upstream server list
│       ├── ssl.conf                # SSL certificate paths
│       ├── maintenance.conf        # Maintenance mode check
│       ├── maintenance.html        # Maintenance page (customisable)
│       ├── maintenance.flag        # Maintenance flag (only when active)
│       └── (full mode only:)
│           ├── security.conf       # Security headers
│           ├── general.conf        # Favicon, robots.txt, gzip
│           └── log.conf            # Per-domain access/error log config
│
├── logs/
│   ├── access.log                  # Global access log
│   ├── error.log                   # Global error log
│   ├── renewal.log                 # Certificate renewal log
│   └── <domain>.access.log         # Per-domain access log (full mode only)
│
├── letsencrypt/
│   ├── lib/                        # Certbot internal working directory
│   └── live/
│       └── <domain>/
│           ├── fullchain.pem       # Certificate + intermediate chain
│           ├── privkey.pem         # Private key
│           └── chain.pem           # Intermediate chain only
│
└── dns/
    ├── cloudns-auth.sh             # ClouDNS DNS-01 auth hook (auto-generated)
    ├── cloudns-cleanup.sh          # ClouDNS DNS-01 cleanup hook (auto-generated)
    ├── namecheap-auth.sh           # Namecheap DNS-01 auth hook (auto-generated)
    └── namecheap-cleanup.sh        # Namecheap DNS-01 cleanup hook (auto-generated)
```

### Key files explained

| File | Purpose |
|------|---------|
| `proxybuilder.json` | Single source of truth — all domains, settings, DNS credentials |
| `dhparam.pem` | DH parameters for stronger SSL (generated once during `init`) |
| `nginx/nginx.conf` | Main nginx config — symlinked to `/etc/nginx/nginx.conf` |
| `proxy/proxy.conf` | Shared proxy headers used by all domains |
| `proxy/letsencrypt.conf` | `.well-known/acme-challenge` location for HTTP-01 challenges |
| `ssl/self-ssl.*` | Fallback certificate for the default nginx server block |
| `apps/<domain>/` | All per-domain config files and the maintenance page |
| `dns/*.sh` | Hook scripts invoked by certbot during DNS-01 challenges |

---

## Configuration File (`proxybuilder.json`)

The config file is the **single source of truth** for all proxybuilder state. It's located at `<target>/proxybuilder.json`.

### Full schema

```json
{
  "version": "2.0",
  "email": "info@example.com",
  "targetFolder": "/opt/proxybuilder",
  "defaults": {
    "proxyMode": "passthrough",
    "certMethod": "webroot"
  },
  "domains": {
    "api.example.com": {
      "proxyMode": "passthrough",
      "upstreams": ["127.0.0.1:3000", "127.0.0.1:3001"],
      "certMethod": "webroot",
      "enabled": true,
      "maintenance": false,
      "wildcard": false,
      "staging": false,
      "created": "2026-03-15T10:00:00.000Z",
      "updated": "2026-03-15T10:00:00.000Z"
    },
    "*.example.com": {
      "proxyMode": "full",
      "upstreams": ["127.0.0.1:8080"],
      "certMethod": "dns",
      "dnsProvider": "cloudns",
      "enabled": true,
      "maintenance": false,
      "wildcard": true,
      "staging": false,
      "created": "2026-03-16T14:30:00.000Z",
      "updated": "2026-03-16T14:30:00.000Z"
    }
  },
  "dns": {
    "cloudns": {
      "provider": "cloudns",
      "authId": "12345",
      "authPassword": "secret"
    },
    "namecheap": {
      "provider": "namecheap",
      "apiUser": "myuser",
      "apiKey": "abc123...",
      "clientIp": "203.0.113.42"
    }
  }
}
```

### Field reference

#### Root level

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Config schema version (currently `"2.0"`) |
| `email` | string | Let's Encrypt contact email |
| `targetFolder` | string | Absolute path to the proxybuilder data directory |
| `defaults` | object | Default settings for new domains |
| `domains` | object | Map of domain name → domain configuration |
| `dns` | object | Map of provider name → DNS credentials |

#### Domain config

| Field | Type | Description |
|-------|------|-------------|
| `proxyMode` | `"passthrough"` \| `"full"` | How much nginx handles |
| `upstreams` | string[] | Upstream addresses (e.g., `["127.0.0.1:3000"]`) |
| `certMethod` | `"webroot"` \| `"dns"` | SSL challenge method |
| `dnsProvider` | string? | DNS provider name (only for `certMethod: "dns"`) |
| `enabled` | boolean | Whether the domain is active in nginx |
| `maintenance` | boolean | Whether maintenance mode is on |
| `wildcard` | boolean | Whether this is a wildcard cert (`*.domain`) |
| `staging` | boolean | Whether using Let's Encrypt staging |
| `created` | string | ISO 8601 creation timestamp |
| `updated` | string | ISO 8601 last-modified timestamp |

> ⚠️ **Manual editing is possible but not recommended.** Use the CLI commands to modify the config — they handle validation, nginx config regeneration, and reload.

---

## Global CLI Options

These options are available on every command:

| Flag | Alias | Default | Description |
|------|-------|---------|-------------|
| `--target` | `-t` | `/opt/proxybuilder` | Target folder for proxybuilder data |
| `--verbose` | | `false` | Enable debug-level output (shows shell commands, extra details) |
| `--quiet` | | `false` | Suppress all output except errors |
| `--version` | | | Show proxybuilder version number |
| `--help` | `-h` | | Show help for any command |

### Using a custom target directory

If you don't want to use the default `/opt/proxybuilder`:

```bash
# Initialize at a custom path
proxybuilder init --email info@example.com --target /srv/proxybuilder

# All subsequent commands must use the same --target
proxybuilder create --domain api.example.com --upstream 127.0.0.1:3000 --target /srv/proxybuilder
proxybuilder list --target /srv/proxybuilder
proxybuilder status --target /srv/proxybuilder
```

### Verbose mode

Useful for debugging — shows every shell command that's executed:

```bash
proxybuilder create --domain api.example.com --upstream 127.0.0.1:3000 --verbose
```

### Quiet mode

Only shows errors — useful in scripts:

```bash
proxybuilder renew --quiet
```

---

## Troubleshooting

### Common errors

| Error | Cause | Solution |
|-------|-------|----------|
| "nginx not found" | nginx is not installed | Run `sudo proxybuilder setup` |
| "certbot not found" | certbot is not installed | Run `sudo proxybuilder setup` |
| "Not initialized" | `proxybuilder.json` doesn't exist | Run `proxybuilder init --email your@email.com` |
| "Domain already exists" | Trying to `create` an existing domain | Use `proxybuilder update` to modify, or `delete` first |
| "Domain not configured" | Domain doesn't exist in config | Check spelling, run `proxybuilder list` |
| "Invalid domain name" | Domain format is wrong | Check for typos, use `*.example.com` for wildcard |
| "Invalid upstream address" | Upstream isn't in `host:port` format | Use `127.0.0.1:3000` format |
| "Wildcard domains require --dns-provider" | Trying to create `*.domain` without DNS provider | Add `--dns-provider cloudns` or `--dns-provider namecheap` |
| "No credentials configured" | DNS provider not set up | Run `proxybuilder dns-setup --provider <name>` |
| "DNS API authentication failed" | Wrong API credentials | Re-run `dns-setup` with correct credentials |

### nginx issues

| Issue | Solution |
|-------|----------|
| nginx config test fails | Run `nginx -t` manually to see the detailed error |
| 502 Bad Gateway | Check that your upstream app is running on the expected port |
| 503 Service Unavailable | Domain may be in maintenance mode — check `proxybuilder maintenance --domain <d> --status` |
| SSL certificate error in browser | Certificate may be from staging — check `proxybuilder cert-info --domain <d>` |

### Certificate issues

| Issue | Solution |
|-------|----------|
| Certificate request fails | Verify DNS A record points to your server, ports 80/443 are open |
| Rate limited by Let's Encrypt | Use `--staging` flag for testing |
| Wildcard cert fails | Verify DNS provider credentials with `proxybuilder dns-setup` |
| Certificate expired | Run `proxybuilder renew --force --domain <d>` |
| Auto-renewal not working | Check cron: `proxybuilder status` should show "Cron: ✓ Installed" |

### Permission issues

| Issue | Solution |
|-------|----------|
| "Permission denied" on setup | Run `sudo proxybuilder setup` (must be root) |
| "Permission denied" on init | Check you have write access to the target directory |
| Can't read/write config | Check file permissions on `proxybuilder.json` |

---

## Command Quick Reference

All commands at a glance:

### Setup & Initialization

```bash
# Install prerequisites (as root)
sudo proxybuilder setup [--dry-run]

# Initialize working directory
proxybuilder init --email <email> [--no-cron] [--dry-run]
```

### Domain Lifecycle

```bash
# Create a domain
proxybuilder create -d <domain> -u <host:port> [-m passthrough|full] [--dns-provider cloudns|namecheap] [--staging] [--dry-run]

# List all domains
proxybuilder list [--json]

# Update a domain
proxybuilder update -d <domain> [-u <host:port>] [-m passthrough|full]

# Enable a disabled domain
proxybuilder enable -d <domain>

# Disable a domain (preserve everything)
proxybuilder disable -d <domain>

# Delete a domain
proxybuilder delete -d <domain> [--force] [--keep-cert]
```

### SSL Certificates

```bash
# Renew all (or specific) certificates
proxybuilder renew [-d <domain>] [--force] [--staging] [--dry-run]

# Revoke a certificate
proxybuilder revoke -d <domain> [--force]

# View certificate details
proxybuilder cert-info -d <domain>
```

### DNS Providers

```bash
# Configure DNS provider credentials
proxybuilder dns-setup -p cloudns|namecheap
```

### Operations

```bash
# Toggle maintenance mode
proxybuilder maintenance -d <domain> --on|--off|--status

# System health overview
proxybuilder status [--json]
```

---

## DNS Provider Comparison

| Feature | ClouDNS | Namecheap |
|---------|---------|-----------|
| **Credential fields** | auth-id, auth-password | apiUser, apiKey, clientIp |
| **API style** | REST + JSON | XML |
| **Record manipulation** | Individual add/delete | Replace all records |
| **IP whitelisting** | Not required | Required |
| **Account requirement** | Any paid plan | $50+ balance or 20+ domains |
| **Setup complexity** | Simple | More involved |
| **Risk during cert issuance** | Low | Higher (don't edit DNS during issuance) |

---

## Proxy Mode Comparison

| Feature | Passthrough | Full |
|---------|-------------|------|
| SSL termination | ✅ | ✅ |
| Proxy headers | ✅ | ✅ |
| Upstream routing | ✅ | ✅ |
| Maintenance mode | ✅ | ✅ |
| Security headers | ❌ | ✅ |
| Gzip compression | ❌ | ✅ |
| Favicon/robots.txt | ❌ | ✅ |
| Per-domain logging | ❌ | ✅ |
| **Best for** | Upstream has its own nginx | Raw HTTP apps (Node, Python, Go) |

---

## Useful Links

- **GitHub:** [https://github.com/TrueSoftwareNL/nginx-proxy](https://github.com/TrueSoftwareNL/nginx-proxy)
- **npm:** [https://www.npmjs.com/package/@blendsdk/proxybuilder](https://www.npmjs.com/package/@blendsdk/proxybuilder)
- **Let's Encrypt:** [https://letsencrypt.org/](https://letsencrypt.org/)
- **Let's Encrypt Rate Limits:** [https://letsencrypt.org/docs/rate-limits/](https://letsencrypt.org/docs/rate-limits/)
- **ClouDNS API Docs:** [https://www.cloudns.net/wiki/article/42/](https://www.cloudns.net/wiki/article/42/)
- **Namecheap API Docs:** [https://www.namecheap.com/support/api/methods/](https://www.namecheap.com/support/api/methods/)

---

[← Back to Index](00-index.md)
