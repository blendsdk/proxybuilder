# 03 — DNS Provider: ClouDNS

> Complete walkthrough for setting up ClouDNS with proxybuilder to issue wildcard SSL certificates.

[← Back to Index](00-index.md) · [Previous: Creating Domains](02-creating-domains.md) · [Next: DNS — Namecheap →](04-dns-namecheap.md)

---

## Why Do I Need This?

Standard SSL certificates (e.g., for `api.example.com`) use the **HTTP-01 challenge** — Let's Encrypt places a file on your server and verifies it via HTTP. This works automatically and doesn't need a DNS provider.

**Wildcard certificates** (e.g., `*.example.com`) cover _all_ subdomains and require the **DNS-01 challenge** — Let's Encrypt asks you to create a specific TXT record in your DNS to prove you own the domain. Proxybuilder automates this through DNS provider APIs.

**You need this guide if:**
- You want a wildcard certificate (`*.example.com`)
- Your domain's DNS is managed by [ClouDNS](https://www.cloudns.net/)

---

## Overview

Here's what we'll do:

1. Get API credentials from ClouDNS
2. Configure the credentials in proxybuilder
3. Create a wildcard domain

---

## Step 1: Get ClouDNS API Credentials

You need two things from ClouDNS: an **Auth ID** and an **Auth Password**.

### 1a. Log in to ClouDNS

Go to [https://www.cloudns.net/](https://www.cloudns.net/) and log in to your account.

### 1b. Create a Sub-Auth User (Recommended)

For security, create a dedicated sub-user for API access rather than using your main account credentials.

1. Navigate to **API** → **Sub-users** in the ClouDNS control panel
2. Click **Add new sub-user**
3. Configure the sub-user:
   - **Auth password**: Choose a strong password
   - **Permissions**: Grant access to the zone(s) you want to manage
4. Note the **sub-auth-id** (a numeric ID) that ClouDNS assigns

> 💡 **Tip:** You can also use your main auth-id if you prefer, but a sub-user is more secure because you can limit its access to specific zones.

### 1c. Verify Your Credentials

You can test your credentials via the ClouDNS API directly:

```bash
curl "https://api.cloudns.net/dns/login.json?sub-auth-id=YOUR_AUTH_ID&auth-password=YOUR_PASSWORD"
```

A successful response looks like:

```json
{"status":"Success","statusDescription":"Success login."}
```

### What you need

| Credential | Example | Description |
|------------|---------|-------------|
| **Auth ID** | `12345` | Your sub-auth-id (or auth-id) — a numeric ID |
| **Auth Password** | `my-secret-pass` | The password for this sub-user |

---

## Step 2: Configure ClouDNS in Proxybuilder

Run the `dns-setup` command and provide your credentials when prompted:

```bash
proxybuilder dns-setup --provider cloudns
```

You'll be prompted interactively:

```
─── DNS Provider Setup: cloudns ──────────────────

  Auth ID (sub-auth-id or auth-id): 12345
  Auth Password: my-secret-pass

  Testing credentials...
  ✓ Credentials verified

  ✓ Credentials saved to config
  ✓ Generated /opt/proxybuilder/dns/cloudns-auth.sh
  ✓ Generated /opt/proxybuilder/dns/cloudns-cleanup.sh

  ✓ DNS provider ClouDNS configured
  You can now create wildcard domains with --dns-provider cloudns
```

### What happens behind the scenes

1. **Credentials are tested** — Proxybuilder makes an API call to `api.cloudns.net/dns/login.json` to verify your credentials work
2. **Credentials are stored** — Saved to `proxybuilder.json` under the `dns` section
3. **Hook scripts are generated** — Two bash scripts are created in `/opt/proxybuilder/dns/`:
   - `cloudns-auth.sh` — Called by certbot to _create_ the `_acme-challenge` TXT record
   - `cloudns-cleanup.sh` — Called by certbot to _delete_ the TXT record after verification

These hook scripts are invoked automatically by certbot during the DNS-01 challenge. You never need to run them manually.

### Verify the config

Check that the credentials are stored:

```bash
cat /opt/proxybuilder/proxybuilder.json | grep -A 4 '"dns"'
```

You should see:

```json
"dns": {
  "cloudns": {
    "provider": "cloudns",
    "authId": "12345",
    "authPassword": "my-secret-pass"
  }
}
```

> 🔒 **Security note:** The config file contains your API password in plain text. Proxybuilder stores it at `/opt/proxybuilder/proxybuilder.json` which is only readable by root. Make sure your server access is properly secured.

---

## Step 3: Create a Wildcard Domain

Now you can create a wildcard certificate that covers `*.example.com`:

```bash
proxybuilder create \
  --domain "*.example.com" \
  --upstream 127.0.0.1:8080 \
  --dns-provider cloudns
```

> ⚠️ **Important:** Always quote the domain when using wildcards — the `*` character has special meaning in the shell.

### What happens during creation

1. Proxybuilder calls certbot with DNS-01 challenge mode
2. Certbot invokes the `cloudns-auth.sh` hook script
3. The hook script creates a `_acme-challenge.example.com` TXT record via the ClouDNS API
4. **Waits 2 minutes** for DNS propagation
5. Let's Encrypt verifies the TXT record
6. Certificate is issued for `*.example.com`
7. Certbot invokes the `cloudns-cleanup.sh` hook script
8. The hook script deletes the TXT record
9. Proxybuilder renders nginx configs and reloads

> ⏱️ **This takes longer than a standard domain** (~3-4 minutes) because of the DNS propagation wait time.

### Verify the wildcard certificate

```bash
proxybuilder cert-info --domain "*.example.com"
```

```
  Subject:        CN = *.example.com
  Issuer:         C = US, O = Let's Encrypt, CN = R3
  Valid From:     Mar 25 00:00:00 2026 GMT
  Valid Until:    Jun 23 00:00:00 2026 GMT
  Days Remaining: 90
  SANs:           *.example.com
  Staging:        No
```

### Test with a subdomain

Any subdomain will now work:

```bash
curl -I https://anything.example.com
curl -I https://app.example.com
curl -I https://api.example.com
```

All of these will hit the upstream at `127.0.0.1:8080`.

---

## Complete Example: End to End

Here's the full workflow from scratch for ClouDNS:

```bash
# 1. Set up DNS credentials (one-time)
proxybuilder dns-setup --provider cloudns
# Enter: Auth ID → 12345
# Enter: Auth Password → my-secret-pass

# 2. Create a wildcard domain
proxybuilder create \
  --domain "*.example.com" \
  --upstream 127.0.0.1:8080 \
  --dns-provider cloudns

# 3. Verify
proxybuilder list
proxybuilder cert-info --domain "*.example.com"

# 4. Test a subdomain
curl -I https://app.example.com
```

### Want load balancing too?

```bash
proxybuilder create \
  --domain "*.example.com" \
  --upstream 127.0.0.1:8080 \
  --upstream 127.0.0.1:8081 \
  --upstream 127.0.0.1:8082 \
  --dns-provider cloudns \
  --mode full
```

### Want to test with staging first?

```bash
# Test with staging cert (not trusted by browsers, but no rate limits)
proxybuilder create \
  --domain "*.example.com" \
  --upstream 127.0.0.1:8080 \
  --dns-provider cloudns \
  --staging

# If it works, delete and re-create with production cert
proxybuilder delete --domain "*.example.com" --force
proxybuilder create \
  --domain "*.example.com" \
  --upstream 127.0.0.1:8080 \
  --dns-provider cloudns
```

---

## How the DNS-01 Challenge Works (Under the Hood)

For those curious about what's happening technically:

```
proxybuilder create --domain "*.example.com" --dns-provider cloudns
         │
         ▼
┌─────────────────────┐
│  certbot certonly    │
│  --manual            │
│  --preferred-        │
│    challenges dns-01 │
│  --manual-auth-hook  │──────┐
│  --manual-cleanup-   │      │
│    hook              │      │
└─────────────────────┘      │
                              ▼
                    ┌──────────────────┐
                    │ cloudns-auth.sh  │
                    │                  │
                    │ proxybuilder     │
                    │ dns-challenge    │
                    │ --action create  │
                    │ --provider       │
                    │   cloudns        │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ ClouDNS API      │
                    │ add-record.json  │
                    │ _acme-challenge  │
                    │ TXT "abc123..."  │
                    └────────┬─────────┘
                             │
                         (2 min wait)
                             │
                             ▼
                    ┌──────────────────┐
                    │ Let's Encrypt    │
                    │ verifies TXT     │
                    │ record           │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────────┐
                    │ cloudns-cleanup.sh   │
                    │ (deletes TXT record) │
                    └──────────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Certificate      │
                    │ issued! 🎉       │
                    └──────────────────┘
```

---

## Troubleshooting ClouDNS

| Problem | Solution |
|---------|----------|
| "ClouDNS API error: Login failed" | Double-check your auth-id and auth-password. Test with `curl` (see Step 1c). |
| "DNS API authentication failed" | Your sub-auth-id may not have permission to the zone. Check ClouDNS sub-user permissions. |
| Certificate request times out | DNS propagation may need more time. Check if the TXT record was created in the ClouDNS dashboard. |
| "Unknown DNS provider" | Make sure you ran `dns-setup` first, and spelled it `cloudns` (not `cloudDNS`). |
| TXT record left behind | If the cleanup fails, manually delete the `_acme-challenge` TXT record in the ClouDNS dashboard. |

---

## What's Next?

- → **[04 — DNS Provider: Namecheap](04-dns-namecheap.md)** — If you also use Namecheap for some domains
- → **[05 — Domain Management](05-domain-management.md)** — Enable, disable, update, delete domains
- → **[06 — SSL Certificates](06-ssl-certificates.md)** — Renewal, revocation, and certificate inspection
