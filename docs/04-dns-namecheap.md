# 04 — DNS Provider: Namecheap

> Complete walkthrough for setting up Namecheap with proxybuilder to issue wildcard SSL certificates.

[← Back to Index](00-index.md) · [Previous: DNS — ClouDNS](03-dns-cloudns.md) · [Next: Domain Management →](05-domain-management.md)

---

## Why Do I Need This?

Standard SSL certificates (e.g., for `api.example.com`) use the **HTTP-01 challenge** — Let's Encrypt places a file on your server and verifies it via HTTP. This works automatically and doesn't need a DNS provider.

**Wildcard certificates** (e.g., `*.example.com`) cover _all_ subdomains and require the **DNS-01 challenge** — Let's Encrypt asks you to create a specific TXT record in your DNS to prove you own the domain. Proxybuilder automates this through DNS provider APIs.

**You need this guide if:**
- You want a wildcard certificate (`*.example.com`)
- Your domain's DNS is managed by [Namecheap](https://www.namecheap.com/)

---

## Overview

Here's what we'll do:

1. Enable API access on your Namecheap account
2. Get your API credentials and whitelist your server IP
3. Configure the credentials in proxybuilder
4. Create a wildcard domain

---

## Step 1: Enable Namecheap API Access

Namecheap API access is not enabled by default. You need to request it.

### 1a. Requirements

Namecheap requires one of the following to enable API access:
- Account balance of $50+, **OR**
- At least 20 domains in your account, **OR**
- Total purchases of $50+ within the last 2 years

### 1b. Enable the API

1. Log in to [https://www.namecheap.com/](https://www.namecheap.com/)
2. Go to **Profile** → **Tools** → **Namecheap API Access**
3. Click **Enable** (if not already enabled)
4. You'll see your **API Key** — copy it and save it securely

### 1c. Whitelist Your Server IP

Namecheap requires that API calls come from a whitelisted IP address.

1. On the same API Access page, scroll to **Whitelisted IPs**
2. Add your **server's public IP address**

Find your server's public IP:

```bash
curl -s https://api.ipify.org
# e.g., 203.0.113.42
```

> ⚠️ **Important:** If your server's IP changes, you'll need to update the whitelist in the Namecheap dashboard, _and_ update the client IP in proxybuilder via `dns-setup` again.

### What you need

| Credential | Example | Description |
|------------|---------|-------------|
| **API Username** | `myusername` | Your Namecheap account username |
| **API Key** | `a1b2c3d4e5f6...` | The API key from Profile → Tools → API Access |
| **Client IP** | `203.0.113.42` | Your server's public IP (must be whitelisted) |

---

## Step 2: Configure Namecheap in Proxybuilder

Run the `dns-setup` command and provide your credentials when prompted:

```bash
proxybuilder dns-setup --provider namecheap
```

You'll be prompted interactively:

```
─── DNS Provider Setup: namecheap ────────────────

  API Username: myusername
  API Key: a1b2c3d4e5f6g7h8i9j0...
  Whitelisted Client IP: 203.0.113.42

  Testing credentials...
  ✓ Credentials verified

  ✓ Credentials saved to config
  ✓ Generated /opt/proxybuilder/dns/namecheap-auth.sh
  ✓ Generated /opt/proxybuilder/dns/namecheap-cleanup.sh

  ✓ DNS provider Namecheap configured
  You can now create wildcard domains with --dns-provider namecheap
```

### What happens behind the scenes

1. **Credentials are tested** — Proxybuilder calls `namecheap.domains.getList` to verify the API key works
2. **Credentials are stored** — Saved to `proxybuilder.json` under the `dns` section
3. **Hook scripts are generated** — Two bash scripts in `/opt/proxybuilder/dns/`:
   - `namecheap-auth.sh` — Called by certbot to _create_ the `_acme-challenge` TXT record
   - `namecheap-cleanup.sh` — Called by certbot to _delete_ the TXT record after verification

### Verify the config

```bash
cat /opt/proxybuilder/proxybuilder.json | grep -A 5 '"namecheap"'
```

```json
"namecheap": {
  "provider": "namecheap",
  "apiUser": "myusername",
  "apiKey": "a1b2c3d4e5f6g7h8i9j0...",
  "clientIp": "203.0.113.42"
}
```

> 🔒 **Security note:** The config file contains your API key in plain text. The file at `/opt/proxybuilder/proxybuilder.json` should only be readable by root.

---

## Step 3: Create a Wildcard Domain

Now create your wildcard domain:

```bash
proxybuilder create \
  --domain "*.example.com" \
  --upstream 127.0.0.1:8080 \
  --dns-provider namecheap
```

> ⚠️ **Always quote the wildcard domain** — the `*` character has special meaning in the shell.

### What happens during creation

1. Proxybuilder calls certbot with DNS-01 challenge mode
2. Certbot invokes the `namecheap-auth.sh` hook script
3. The hook script:
   - **Fetches ALL existing DNS records** for the domain via `namecheap.domains.dns.getHosts`
   - **Adds** the `_acme-challenge` TXT record to the list
   - **Sets ALL records** at once via `namecheap.domains.dns.setHosts`
4. **Waits 2 minutes** for DNS propagation
5. Let's Encrypt verifies the TXT record
6. Certificate is issued for `*.example.com`
7. Certbot invokes the `namecheap-cleanup.sh` hook script
8. The hook script fetches all records again, removes the challenge TXT, and sets the rest back
9. Proxybuilder renders nginx configs and reloads

> ⏱️ **This takes ~3-4 minutes** because of the DNS propagation wait time.

### Verify

```bash
proxybuilder cert-info --domain "*.example.com"
proxybuilder list
curl -I https://app.example.com
```

---

## ⚠️ Critical: How Namecheap's API Works

**This is the most important thing to understand about using Namecheap with proxybuilder.**

Unlike most DNS providers, Namecheap's `setHosts` API **replaces ALL DNS records for the domain** — it doesn't add or remove individual records. This means:

1. **Before adding a TXT record:** Proxybuilder fetches _all_ existing records, adds the challenge TXT record to the list, then sets the entire list.
2. **After the challenge:** Proxybuilder fetches _all_ records again, removes only the challenge TXT record, then sets the rest back.

### Why this matters

- ✅ Proxybuilder handles this correctly — it always preserves your existing records
- ⚠️ **Don't modify your DNS records in the Namecheap dashboard while a certificate is being issued** — if you change records during the ~3 minute window between the auth and cleanup hooks, those changes could be lost
- ⚠️ If the cleanup hook fails (e.g., network error), you may need to manually remove the `_acme-challenge` TXT record from the Namecheap dashboard

### Comparison with ClouDNS

| Feature | ClouDNS | Namecheap |
|---------|---------|-----------|
| Add individual record | ✅ Yes (`add-record.json`) | ❌ No (must replace all) |
| Delete individual record | ✅ Yes (`delete-record.json`) | ❌ No (must replace all) |
| Risk of data loss | Low | Higher (if used during DNS changes) |
| API style | REST/JSON | XML |
| IP whitelisting required | No | Yes |
| Setup complexity | Simpler | More involved |

---

## Complete Example: End to End

Here's the full workflow from scratch for Namecheap:

```bash
# 1. Find your server's public IP
curl -s https://api.ipify.org
# → 203.0.113.42

# 2. In Namecheap dashboard:
#    - Enable API access (Profile → Tools → API Access)
#    - Whitelist 203.0.113.42

# 3. Set up DNS credentials (one-time)
proxybuilder dns-setup --provider namecheap
# Enter: API Username → myusername
# Enter: API Key → a1b2c3d4e5f6...
# Enter: Whitelisted Client IP → 203.0.113.42

# 4. Create a wildcard domain
proxybuilder create \
  --domain "*.example.com" \
  --upstream 127.0.0.1:8080 \
  --dns-provider namecheap

# 5. Verify
proxybuilder list
proxybuilder cert-info --domain "*.example.com"

# 6. Test
curl -I https://app.example.com
curl -I https://api.example.com
```

### With full mode and load balancing

```bash
proxybuilder create \
  --domain "*.example.com" \
  --upstream 127.0.0.1:8080 \
  --upstream 127.0.0.1:8081 \
  --dns-provider namecheap \
  --mode full
```

### Test with staging first

```bash
# Staging cert (free, unlimited, but not browser-trusted)
proxybuilder create \
  --domain "*.example.com" \
  --upstream 127.0.0.1:8080 \
  --dns-provider namecheap \
  --staging

# If it works, switch to production
proxybuilder delete --domain "*.example.com" --force
proxybuilder create \
  --domain "*.example.com" \
  --upstream 127.0.0.1:8080 \
  --dns-provider namecheap
```

---

## Troubleshooting Namecheap

| Problem | Solution |
|---------|----------|
| "Namecheap API error" | Check API key and username. Make sure API access is enabled in Namecheap dashboard. |
| "DNS API authentication failed" | Your server IP may not be whitelisted. Run `curl -s https://api.ipify.org` and check the Namecheap whitelist. |
| "IP not whitelisted" error | Add your server's current IP to Namecheap API Access → Whitelisted IPs. |
| Certificate request fails | DNS propagation may need more time. Check if the TXT record was created in the Namecheap dashboard. |
| Missing DNS records after cert | This shouldn't happen, but if it does: the setHosts call may have failed mid-way. Restore from Namecheap's DNS backup. |
| API access denied | Namecheap requires $50+ balance, 20+ domains, or $50+ in purchases. Check your account eligibility. |
| Server IP changed | Re-run `proxybuilder dns-setup --provider namecheap` with the new IP, and update the Namecheap whitelist. |

---

## Using Both ClouDNS and Namecheap

You can configure both DNS providers and use different ones for different domains:

```bash
# Configure both (one-time each)
proxybuilder dns-setup --provider cloudns
proxybuilder dns-setup --provider namecheap

# Use ClouDNS for one domain
proxybuilder create --domain "*.example.com" --upstream 127.0.0.1:8080 --dns-provider cloudns

# Use Namecheap for another
proxybuilder create --domain "*.myother.com" --upstream 127.0.0.1:9090 --dns-provider namecheap
```

Both sets of credentials are stored in `proxybuilder.json` and the correct hook scripts are used for each domain automatically.

---

## What's Next?

- → **[05 — Domain Management](05-domain-management.md)** — Enable, disable, update, delete domains
- → **[06 — SSL Certificates](06-ssl-certificates.md)** — Renewal, revocation, and certificate inspection
