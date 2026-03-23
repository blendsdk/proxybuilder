# Setup & Init Commands: Proxybuilder v2

> **Document**: 03-04-commands-setup-init.md
> **Parent**: [Index](00-index.md)

## Overview

Two foundational commands that prepare a server for proxybuilder:
1. `setup` — Installs system-level prerequisites (nginx, certbot, firewall)
2. `init` — Creates the proxybuilder working directory and configures nginx

These are typically run once per server.

## Command: `setup`

### Purpose

Automates the manual installation steps from the v1 README. Installs and configures all system-level software required for proxybuilder to function.

### Usage

```bash
sudo proxybuilder setup [--dry-run]
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--dry-run` | | boolean | no | false | Show what would be installed without executing |

### Pre-flight Checks

1. Must be run as root/sudo — exit with error if not
2. Must be on Debian/Ubuntu — check `/etc/os-release`

### Operations (in order)

```
1. Detect OS and version
2. Update package lists (apt-get update)
3. Install base packages:
   - apt-transport-https
   - ca-certificates
   - curl
   - gnupg-agent
   - software-properties-common
   - wget
4. Install nginx (apt-get install nginx)
5. Install snapd (apt-get install snapd)
6. Install certbot via snap (snap install --classic certbot)
7. Create certbot symlink (/snap/bin/certbot → /usr/bin/certbot)
8. Configure UFW firewall:
   - ufw allow OpenSSH
   - ufw allow 'Nginx Full'
   - ufw --force enable
9. Verify installations:
   - nginx -v
   - certbot --version
   - openssl version
10. Print summary of what was installed/configured
```

### Implementation

```typescript
export const command = "setup";
export const desc = "Install system prerequisites (nginx, certbot, firewall)";

export const builder: CommandBuilder = {
    "dry-run": {
        type: "boolean",
        default: false,
        description: "Show what would be installed without executing",
    },
};

export const handler = (argv: SetupArgs) => {
    // 1. Check root
    if (!Validator.isRoot()) {
        logger.error("The setup command must be run as root (use sudo)");
        process.exit(1);
    }

    // 2. Check OS
    if (!isDebianBased()) {
        logger.error("This tool only supports Debian/Ubuntu systems");
        process.exit(1);
    }

    // 3. Install packages
    logger.section("Installing system packages");
    // ... apt-get install commands

    // 4. Install certbot
    logger.section("Installing certbot");
    // ... snap install commands

    // 5. Configure firewall
    logger.section("Configuring firewall");
    // ... ufw commands

    // 6. Verify
    logger.section("Verification");
    // ... check versions

    logger.success("System setup complete!");
    logger.info("Next step: run 'proxybuilder init' to create the working directory");
};
```

### Output Example

```
2026-03-23 14:30:00 [INFO]  ═══ System Setup ═══

2026-03-23 14:30:00 [INFO]  ─── Detecting system ───
2026-03-23 14:30:00 [INFO]  OS: Ubuntu 22.04 LTS
2026-03-23 14:30:00 [INFO]  Architecture: x86_64

2026-03-23 14:30:00 [INFO]  ─── Installing system packages ───
2026-03-23 14:30:00 [CMD]   apt-get update -y
2026-03-23 14:30:05 [OK]    Package lists updated
2026-03-23 14:30:05 [CMD]   apt-get install -y nginx snapd ...
2026-03-23 14:30:30 [OK]    Packages installed

2026-03-23 14:30:30 [INFO]  ─── Installing certbot ───
2026-03-23 14:30:30 [CMD]   snap install --classic certbot
2026-03-23 14:30:45 [OK]    Certbot installed
2026-03-23 14:30:45 [CMD]   ln -sf /snap/bin/certbot /usr/bin/certbot
2026-03-23 14:30:45 [OK]    Certbot symlink created

2026-03-23 14:30:45 [INFO]  ─── Configuring firewall ───
2026-03-23 14:30:45 [CMD]   ufw allow OpenSSH
2026-03-23 14:30:45 [CMD]   ufw allow 'Nginx Full'
2026-03-23 14:30:46 [OK]    Firewall configured

2026-03-23 14:30:46 [INFO]  ─── Verification ───
2026-03-23 14:30:46 [INFO]  ✓ nginx: 1.24.0
2026-03-23 14:30:46 [INFO]  ✓ certbot: 2.9.0
2026-03-23 14:30:46 [INFO]  ✓ openssl: 3.0.2

2026-03-23 14:30:46 [OK]    ✅ System setup complete!
2026-03-23 14:30:46 [INFO]  Next: run 'proxybuilder init --email your@email.com'
```

### Error Handling

| Error | Response |
|-------|----------|
| Not root | "The setup command must be run as root (use sudo)" + exit 1 |
| Not Debian/Ubuntu | "This tool only supports Debian/Ubuntu systems" + exit 1 |
| apt-get fails | Show stderr, suggest checking internet connection |
| snap fails | Show stderr, suggest installing snapd manually |
| Package already installed | Skip with info message "nginx already installed (version X.X)" |

---

## Command: `init`

### Purpose

Creates the proxybuilder working directory structure, generates cryptographic materials (DH params, self-signed cert), renders the main nginx.conf, creates the proxybuilder.json config file, and optionally installs the cron job for auto-renewal.

### Usage

```bash
proxybuilder init --email info@example.com [--target /opt/proxybuilder] [--no-cron]
```

### Arguments

| Flag | Alias | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--email` | `-e` | string | yes | | Let's Encrypt contact email |
| `--target` | `-t` | string | no | /opt/proxybuilder | Target folder |
| `--no-cron` | | boolean | no | false | Skip cron job installation |
| `--dry-run` | | boolean | no | false | Show what would happen |

### Pre-flight Checks

1. Validate email format
2. Check nginx is installed (suggest `setup` if not)
3. Check certbot is installed (suggest `setup` if not)
4. Check write permissions on target folder parent
5. Warn if target folder already exists (and has config)

### Operations (in order)

```
1. Create directory structure:
   <target>/
   ├── nginx/
   │   ├── sites-enabled/
   │   ├── sites-disabled/
   │   ├── modules-enabled/
   │   └── conf.d/
   ├── proxy/
   ├── ssl/
   ├── apps/
   ├── logs/
   ├── letsencrypt/
   │   └── lib/
   └── dns/

2. Generate DH parameters (openssl dhparam -out <target>/dhparam.pem 2048)

3. Generate self-signed certificate:
   openssl req -batch -x509 -nodes -days 365 \
     -newkey rsa:2048 \
     -keyout <target>/ssl/self-ssl.key \
     -out <target>/ssl/self-ssl.crt

4. Render nginx.conf template → <target>/nginx/nginx.conf

5. Render shared proxy configs:
   - proxy.conf → <target>/proxy/proxy.conf
   - letsencrypt.conf → <target>/proxy/letsencrypt.conf

6. Create/update nginx.conf symlink:
   - Backup existing /etc/nginx/nginx.conf
   - Symlink <target>/nginx/nginx.conf → /etc/nginx/nginx.conf

7. Create proxybuilder.json config file

8. Install cron job (unless --no-cron):
   - Add to crontab: "0 3 * * * proxybuilder renew --target <target>"

9. Test nginx config (nginx -t)
10. Reload nginx (nginx -s reload)
```

### Implementation

```typescript
export const command = "init";
export const desc = "Initialize proxybuilder working directory";

export const builder: CommandBuilder = {
    e: {
        alias: "email",
        type: "string",
        required: true,
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
```

### Idempotency

The `init` command is designed to be safely re-runnable:
- Folders: created only if they don't exist (`mkdirSync({ recursive: true })`)
- DH params: generated only if file doesn't exist
- Self-signed cert: generated only if file doesn't exist
- nginx.conf: always re-rendered (picks up any template changes)
- Config file: created only if it doesn't exist; if it exists, only the version is validated
- Cron job: checked before adding (no duplicates)
- Symlinks: created only if they don't exist

### Error Handling

| Error | Response |
|-------|----------|
| Invalid email | "Invalid email address format" + exit 1 |
| nginx not installed | "nginx not found. Run 'sudo proxybuilder setup' first" + exit 1 |
| certbot not installed | "certbot not found. Run 'sudo proxybuilder setup' first" + exit 1 |
| Cannot create target folder | "Permission denied creating <folder>. Check permissions" + exit 1 |
| DH param generation fails | Log error, suggest checking openssl installation |
| nginx -t fails | Show nginx error output, don't reload |
| Config already exists | "Config already exists at <path>. Use --force to reinitialize" + skip config creation |

## Testing Requirements

- `setup` installs all prerequisites on a clean Ubuntu system
- `setup --dry-run` shows operations without executing
- `init` creates complete directory structure
- `init` generates valid DH params and self-signed cert
- `init` renders valid nginx.conf that passes `nginx -t`
- `init` creates valid proxybuilder.json
- `init` is idempotent (safe to run multiple times)
- `init` installs cron job correctly
