# Template Engine & Nginx Templates: Proxybuilder v2

> **Document**: 03-03-template-engine.md
> **Parent**: [Index](00-index.md)

## Overview

This document specifies the template engine (improved from v1) and all nginx configuration templates for both passthrough and full proxy modes. Templates use `%variable%` placeholder syntax and are rendered to disk as nginx configuration files.

## Architecture

### Template Resolution

Templates live in `src/templates/` and are copied to `dist/templates/` during build. At runtime, they're resolved via:
```typescript
path.join(__dirname, "templates", templatePath)
```

### Template Directory Structure

```
templates/
├── nginx.conf               # Main nginx config
├── proxy.conf               # Proxy headers (shared)
├── letsencrypt.conf         # ACME challenge location block
├── maintenance.conf         # Maintenance mode check snippet
├── passthrough/
│   ├── site.conf            # Passthrough site (SSL + routing only)
│   ├── upstream.conf        # Upstream block
│   └── ssl.conf             # SSL cert paths
├── full/
│   ├── site.conf            # Full site (SSL + headers + gzip + logging)
│   ├── upstream.conf        # Upstream block (same as passthrough)
│   ├── ssl.conf             # SSL cert paths (same as passthrough)
│   ├── security.conf        # Security headers
│   ├── general.conf         # Gzip, favicon, robots
│   └── log.conf             # Access/error log paths
└── pages/
    ├── maintenance.html     # Default maintenance page
    └── 502.html             # Default bad gateway page
```

## Implementation Details

### Template Engine (`renderTemplate` function)

Located in `builder.ts` or a dedicated `template.ts` utility:

```typescript
export function renderTemplate(
    templatePath: string,
    data: Record<string, string>,
    outFile: string,
    logger: Logger
): void {
    const fullPath = path.join(__dirname, "templates", templatePath);
    let template = fs.readFileSync(fullPath, "utf-8");

    // Replace all %variable% placeholders
    for (const [key, value] of Object.entries(data)) {
        const placeholder = `%${key}%`;
        template = template.replaceAll(placeholder, value);
    }

    // Validate: check for unreplaced placeholders
    const unreplaced = template.match(/%[a-zA-Z_]+%/g);
    if (unreplaced) {
        const unique = [...new Set(unreplaced)];
        logger.warn(`Template ${templatePath} has unreplaced placeholders: ${unique.join(", ")}`);
    }

    // Write output
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, template, "utf-8");
    logger.debug(`Rendered template ${templatePath} → ${outFile}`);
}
```

**Improvements over v1:**
- Uses `String.replaceAll()` instead of `new RegExp()` (cleaner, no regex escaping issues)
- Validates unreplaced placeholders after rendering (warns if any `%var%` remains)
- Creates parent directories automatically
- Logs template rendering operations
- Explicit `utf-8` encoding

### Template: `nginx.conf` (Main Nginx Config)

```nginx
user                 www-data;
pid                  /run/nginx.pid;
worker_processes     auto;
worker_rlimit_nofile 65535;

# Load modules
include              %modulesEnabled%/*.conf;

events {
    multi_accept       on;
    worker_connections 65535;
}

http {
    charset                utf-8;
    sendfile               on;
    tcp_nopush             on;
    tcp_nodelay            on;
    server_tokens          off;
    log_not_found          off;
    types_hash_max_size    2048;
    types_hash_bucket_size 64;
    client_max_body_size   16M;

    # MIME
    include                mime.types;
    default_type           application/octet-stream;

    # Logging
    access_log             %logsFolder%/access.log;
    error_log              %logsFolder%/error.log warn;

    # SSL
    ssl_session_timeout    1d;
    ssl_session_cache      shared:SSL:10m;
    ssl_session_tickets    off;

    # Diffie-Hellman parameter for DHE ciphersuites
    ssl_dhparam            %dhparamFile%;

    # Mozilla Intermediate configuration
    ssl_protocols          TLSv1.2 TLSv1.3;
    ssl_ciphers            ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;

    # OCSP Stapling
    ssl_stapling           on;
    ssl_stapling_verify    on;
    resolver               1.1.1.1 1.0.0.1 8.8.8.8 8.8.4.4 208.67.222.222 208.67.220.220 valid=60s;
    resolver_timeout       2s;

    # Connection header for WebSocket reverse proxy
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ""      close;
    }

    map $remote_addr $proxy_forwarded_elem {
        ~^[0-9.]+$        "for=$remote_addr";
        ~^[0-9A-Fa-f:.]+$ "for=\"[$remote_addr]\"";
        default           "for=unknown";
    }

    map $http_forwarded $proxy_add_forwarded {
        "~^(,[ \\t]*)*([!#$%&'*+.^_`|~0-9A-Za-z-]+=([!#$%&'*+.^_`|~0-9A-Za-z-]+|\"([\\t \\x21\\x23-\\x5B\\x5D-\\x7E\\x80-\\xFF]|\\\\[\\t \\x21-\\x7E\\x80-\\xFF])*\"))?(;([!#$%&'*+.^_`|~0-9A-Za-z-]+=([!#$%&'*+.^_`|~0-9A-Za-z-]+|\"([\\t \\x21\\x23-\\x5B\\x5D-\\x7E\\x80-\\xFF]|\\\\[\\t \\x21-\\x7E\\x80-\\xFF])*\"))?)*([ \\t]*,([ \\t]*([!#$%&'*+.^_`|~0-9A-Za-z-]+=([!#$%&'*+.^_`|~0-9A-Za-z-]+|\"([\\t \\x21\\x23-\\x5B\\x5D-\\x7E\\x80-\\xFF]|\\\\[\\t \\x21-\\x7E\\x80-\\xFF])*\"))?(;([!#$%&'*+.^_`|~0-9A-Za-z-]+=([!#$%&'*+.^_`|~0-9A-Za-z-]+|\"([\\t \\x21\\x23-\\x5B\\x5D-\\x7E\\x80-\\xFF]|\\\\[\\t \\x21-\\x7E\\x80-\\xFF])*\"))?)*)?)*$" "$http_forwarded, $proxy_forwarded_elem";
        default "$proxy_forwarded_elem";
    }

    # Load configs
    include                %confDFolder%/*.conf;
    include                %sitesEnabled%/*.conf;
}
```

**Variables:** `%modulesEnabled%`, `%logsFolder%`, `%dhparamFile%`, `%confDFolder%`, `%sitesEnabled%`

### Template: `proxy.conf` (Shared Proxy Headers)

```nginx
proxy_http_version                 1.1;
proxy_cache_bypass                 $http_upgrade;

# Proxy headers — minimal set for passthrough
proxy_set_header Upgrade           $http_upgrade;
proxy_set_header Connection        $connection_upgrade;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
proxy_set_header X-Forwarded-Port  $server_port;

# Proxy timeouts
proxy_connect_timeout              60s;
proxy_send_timeout                 60s;
proxy_read_timeout                 60s;
```

**Changes from v1:**
- `Connection` header uses `$connection_upgrade` (was `""` — broke WebSocket support)
- Removed `Forwarded` header (non-standard, can conflict with upstream)

### Template: `letsencrypt.conf`

```nginx
# ACME-challenge for Let's Encrypt
location ^~ /.well-known/acme-challenge/ {
    root %wwwFolder%;
}
```

### Template: `maintenance.conf`

```nginx
# Maintenance mode — file-based toggle (no reload needed)
set $maintenance 0;
if (-f %appFolder%/%domain%/maintenance.flag) {
    set $maintenance 1;
}

# Allow ACME challenges even in maintenance mode
location ^~ /.well-known/acme-challenge/ {
    root %wwwFolder%;
}

# Serve maintenance page when flag is set
error_page 503 @maintenance;
location @maintenance {
    root %appFolder%/%domain%;
    try_files /maintenance.html =503;
    internal;
}
```

### Template: `passthrough/site.conf` (Passthrough Mode)

```nginx
# %domain% — Passthrough mode (SSL termination + routing only)
# Managed by proxybuilder — do not edit manually

include %appFolder%/%domain%/upstream.conf;

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name %serverName%;

    # SSL certificates
    include %appFolder%/%domain%/ssl.conf;

    # Maintenance mode
    include %appFolder%/%domain%/maintenance.conf;

    # Reverse proxy to upstream
    location / {
        if ($maintenance) {
            return 503;
        }
        proxy_pass http://%upstreamName%;
        include %proxyFolder%/proxy.conf;
    }
}

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name %serverName%;

    # Let's Encrypt ACME challenge
    include %proxyFolder%/letsencrypt.conf;

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://%domain%$request_uri;
    }
}
```

**Variables:** `%domain%`, `%serverName%`, `%appFolder%`, `%upstreamName%`, `%proxyFolder%`

**Note:** `%serverName%` will be `example.com` for standard domains or `.example.com` (with dot prefix for nginx wildcard matching) for wildcard domains.

### Template: `passthrough/upstream.conf`

```nginx
# Upstream servers for %domain% (round-robin)
upstream %upstreamName% {
%upstreamServers%
    keepalive 8;
}
```

**Variables:** `%domain%`, `%upstreamName%`, `%upstreamServers%`

`%upstreamServers%` is generated dynamically, e.g.:
```nginx
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
```

### Template: `passthrough/ssl.conf` and `full/ssl.conf` (identical)

```nginx
# SSL certificates for %domain%
ssl_certificate     %sslFolder%/live/%domain%/fullchain.pem;
ssl_certificate_key %sslFolder%/live/%domain%/privkey.pem;
ssl_trusted_certificate %sslFolder%/live/%domain%/chain.pem;
```

### Template: `full/site.conf` (Full Mode)

```nginx
# %domain% — Full mode (SSL + security headers + gzip + logging)
# Managed by proxybuilder — do not edit manually

include %appFolder%/%domain%/upstream.conf;

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name %serverName%;

    # SSL certificates
    include %appFolder%/%domain%/ssl.conf;

    # Logging
    include %appFolder%/%domain%/log.conf;

    # Security headers
    include %appFolder%/%domain%/security.conf;

    # Maintenance mode
    include %appFolder%/%domain%/maintenance.conf;

    # General (gzip, favicon, robots)
    include %appFolder%/%domain%/general.conf;

    # Reverse proxy to upstream
    location / {
        if ($maintenance) {
            return 503;
        }
        proxy_pass http://%upstreamName%;
        include %proxyFolder%/proxy.conf;
    }
}

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name %serverName%;

    # Logging
    include %appFolder%/%domain%/log.conf;

    # Let's Encrypt ACME challenge
    include %proxyFolder%/letsencrypt.conf;

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://%domain%$request_uri;
    }
}
```

### Template: `full/security.conf`

```nginx
# Security headers
add_header X-XSS-Protection          "1; mode=block" always;
add_header X-Content-Type-Options    "nosniff" always;
add_header Referrer-Policy           "no-referrer-when-downgrade" always;
add_header Permissions-Policy        "interest-cohort=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Block access to hidden files (except .well-known)
location ~ /\.(?!well-known) {
    deny all;
}
```

### Template: `full/general.conf`

```nginx
# favicon.ico
location = /favicon.ico {
    log_not_found off;
    access_log    off;
}

# robots.txt
location = /robots.txt {
    log_not_found off;
    access_log    off;
}

# gzip compression
gzip            on;
gzip_vary       on;
gzip_proxied    any;
gzip_comp_level 6;
gzip_types      text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;
```

### Template: `full/log.conf`

```nginx
access_log %logFolder%/%domain%.access.log;
error_log  %logFolder%/%domain%.error.log warn;
```

### Template: `full/upstream.conf`

Same as `passthrough/upstream.conf` — identical template.

### Template: `pages/maintenance.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Under Maintenance</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .container {
            text-align: center;
            padding: 2rem;
            max-width: 500px;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        p {
            color: #666;
            line-height: 1.6;
        }
        .pulse {
            display: inline-block;
            width: 8px;
            height: 8px;
            background: #4CAF50;
            border-radius: 50%;
            margin-right: 0.5rem;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        .status {
            margin-top: 2rem;
            font-size: 0.85rem;
            color: #999;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🔧</div>
        <h1>We'll be back shortly</h1>
        <p>We're performing scheduled maintenance to improve our services. Please check back in a few minutes.</p>
        <div class="status">
            <span class="pulse"></span>
            Maintenance in progress
        </div>
    </div>
</body>
</html>
```

### Template: `pages/502.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Service Unavailable</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .container { text-align: center; padding: 2rem; max-width: 500px; }
        .icon { font-size: 4rem; margin-bottom: 1rem; }
        h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; }
        p { color: #666; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">⚠️</div>
        <h1>Service Unavailable</h1>
        <p>The upstream server is not responding. Please try again later.</p>
    </div>
</body>
</html>
```

## Upstream Server Generation

The `%upstreamServers%` variable is generated dynamically in the builder:

```typescript
function generateUpstreamServers(upstreams: string[]): string {
    return upstreams.map(u => `    server ${u};`).join("\n");
}
```

For a domain with `upstreams: ["127.0.0.1:3000", "127.0.0.1:3001"]`, this produces:
```nginx
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
```

## Upstream Name Generation

The upstream name is derived from the domain to create a valid nginx identifier:

```typescript
function generateUpstreamName(domain: string): string {
    return "backend_" + domain.replace(/[^a-zA-Z0-9]/g, "_");
}
```

- `api.example.com` → `backend_api_example_com`
- `*.example.com` → `backend___example_com`

## Server Name Generation

For nginx `server_name` directive:

```typescript
function generateServerName(domain: string, wildcard: boolean): string {
    if (wildcard) {
        // *.example.com → need both *.example.com and example.com
        const baseDomain = domain.replace("*.", "");
        return `${domain} ${baseDomain}`;
    }
    return domain;
}
```

## Testing Requirements

- Template rendering replaces all variables correctly
- Unreplaced variable warning triggers when expected
- Generated nginx configs pass `nginx -t` validation
- Maintenance page renders correctly in browser
- Passthrough mode config has NO security headers or gzip
- Full mode config has security headers AND gzip
- Upstream block correctly lists multiple servers
