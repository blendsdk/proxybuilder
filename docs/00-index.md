# Proxybuilder v2 — Tutorial & Guide

> Complete step-by-step guide for setting up and using Proxybuilder v2, the nginx reverse proxy configuration builder with SSL, load balancing, and maintenance mode.

---

## What is Proxybuilder?

Proxybuilder builds and manages nginx reverse proxy configurations on Ubuntu servers. It handles:

- **SSL certificate provisioning** via Let's Encrypt (including wildcard certificates)
- **Round-robin load balancing** to multiple upstream servers
- **File-based maintenance mode** that requires no nginx reloads
- **Two proxy modes**: passthrough (SSL + routing only) and full (security headers, gzip, logging)

```
┌──────────────────────────────────────────────────┐
│                   Internet                       │
└────────────────────┬─────────────────────────────┘
                     │ HTTPS (443) / HTTP (80)
                     ▼
┌──────────────────────────────────────────────────┐
│                Nginx Proxy                       │
│           (managed by proxybuilder)              │
│                                                  │
│  ┌──────────────┐ ┌──────────┐ ┌─────────────┐   │
│  │     SSL      │ │ Routing  │ │ Maintenance │   │
│  │ Termination  │ │ by domain│ │ Mode Check  │   │
│  └──────────────┘ └──────────┘ └─────────────┘   │
└──┬──────────────────┬────────────────┬───────────┘
   │                  │                │
   ▼                  ▼                ▼
┌──────────┐   ┌──────────┐   ┌───────────────┐
│ Upstream │   │ Upstream │   │ Upstream      │
│ App 1    │   │ App 2    │   │ App 3 (x3)    │
│ :3000    │   │ :4000    │   │ :8080,:8081   │
│          │   │ (nginx)  │   │ :8082         │
└──────────┘   └──────────┘   └───────────────┘
```

---

## Tutorial Pages

Read these in order for a complete walkthrough, or jump to the topic you need.

### Getting Started

| #   | Guide                                                | Description                                                              |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| 01  | [Installation & Setup](01-installation-and-setup.md) | Prerequisites, installing proxybuilder, system setup, and initialization |
| 02  | [Creating Domains](02-creating-domains.md)           | Your first domain, proxy modes (passthrough vs full), load balancing     |

### DNS Providers & Wildcard Certificates

| #   | Guide                                          | Description                                                   |
| --- | ---------------------------------------------- | ------------------------------------------------------------- |
| 03  | [DNS Provider: ClouDNS](03-dns-cloudns.md)     | Setting up ClouDNS for wildcard certificates (step-by-step)   |
| 04  | [DNS Provider: Namecheap](04-dns-namecheap.md) | Setting up Namecheap for wildcard certificates (step-by-step) |

### Day-to-Day Operations

| #   | Guide                                              | Description                                              |
| --- | -------------------------------------------------- | -------------------------------------------------------- |
| 05  | [Domain Management](05-domain-management.md)       | Enable, disable, update, and delete domains              |
| 06  | [SSL Certificates](06-ssl-certificates.md)         | Renew, revoke, inspect certs, staging mode, auto-renewal |
| 07  | [Maintenance Mode](07-maintenance-mode.md)         | Zero-downtime maintenance mode for CI/CD pipelines       |
| 08  | [Monitoring & Status](08-monitoring-and-status.md) | Health checks, status overview, JSON output for scripts  |

### Reference

| #   | Guide                        | Description                                                                          |
| --- | ---------------------------- | ------------------------------------------------------------------------------------ |
| 09  | [Reference](09-reference.md) | Directory structure, config schema, global options, troubleshooting, quick reference |

---

## Quick Start (TL;DR)

If you just want to get going fast:

```bash
# Install
npm install -g @blendsdk/proxybuilder

# System setup (as root, on Ubuntu)
sudo proxybuilder setup

# Initialize
proxybuilder init --email you@example.com

# Add a domain
proxybuilder create --domain api.example.com --upstream 127.0.0.1:3000

# Check status
proxybuilder list
```

Then read [02 — Creating Domains](02-creating-domains.md) for proxy modes and load balancing, or [03](03-dns-cloudns.md)/[04](04-dns-namecheap.md) for wildcard certificates.
