# DNS Providers: Proxybuilder v2

> **Document**: 03-08-dns-providers.md
> **Parent**: [Index](00-index.md)

## Overview

DNS provider integrations enable DNS-01 certificate challenges required for wildcard SSL certificates (`*.example.com`). This document specifies the provider abstraction layer and implementations for ClouDNS and Namecheap.

## Architecture

### Plugin Pattern

```
dns/
├── provider.ts      # IDnsProvider interface + provider registry
├── cloudns.ts       # ClouDNS implementation
└── namecheap.ts     # Namecheap implementation
```

Each provider implements a common interface. New providers can be added by creating a new file and registering it.

### How DNS-01 Challenge Works

1. Certbot needs to verify you control the domain
2. Certbot calls `auth-hook.sh` with `CERTBOT_DOMAIN` and `CERTBOT_VALIDATION`
3. The hook creates a TXT record: `_acme-challenge.<domain>` with the validation token
4. Certbot verifies the TXT record exists
5. Certbot calls `cleanup-hook.sh` to remove the TXT record
6. Certificate is issued

### Integration Flow

```
certbot → auth-hook.sh → proxybuilder dns-challenge → ClouDNS/Namecheap API
                                                         ↓
                                                    Create TXT record
                                                         ↓
                                                    Wait for propagation
                                                         ↓
certbot verifies ← DNS resolves ← TXT record propagated
                                                         ↓
certbot → cleanup-hook.sh → proxybuilder dns-challenge → Delete TXT record
```

## Implementation Details

### `provider.ts` — Interface & Registry

```typescript
export interface IDnsProvider {
    readonly name: string;
    readonly displayName: string;
    readonly credentialFields: Array<{
        name: string;
        description: string;
        secret: boolean;  // If true, mask in logs
    }>;

    // Create a TXT record for ACME challenge
    createTxtRecord(
        domain: string,
        recordName: string,  // "_acme-challenge" or "_acme-challenge.sub"
        value: string,       // The validation token
        credentials: Record<string, string>
    ): Promise<void>;

    // Delete the TXT record after challenge
    deleteTxtRecord(
        domain: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>
    ): Promise<void>;

    // Test if credentials are valid (optional)
    testCredentials(
        credentials: Record<string, string>
    ): Promise<boolean>;
}

// Provider registry
const providers: Map<string, IDnsProvider> = new Map();

export function registerProvider(provider: IDnsProvider): void {
    providers.set(provider.name, provider);
}

export function getProvider(name: string): IDnsProvider | undefined {
    return providers.get(name);
}

export function listProviders(): IDnsProvider[] {
    return Array.from(providers.values());
}
```

### `cloudns.ts` — ClouDNS Implementation

**API Documentation:** https://www.cloudns.net/wiki/article/42/

**Credential Fields:**
- `authId` — Sub-auth-id or auth-id
- `authPassword` — API password

**Key API Endpoints:**

| Action | URL | Method |
|--------|-----|--------|
| Login test | `https://api.cloudns.net/dns/login.json` | GET |
| List records | `https://api.cloudns.net/dns/records.json` | GET |
| Add record | `https://api.cloudns.net/dns/add-record.json` | POST |
| Delete record | `https://api.cloudns.net/dns/delete-record.json` | POST |

```typescript
import { IDnsProvider, registerProvider } from "./provider";

class ClouDNSProvider implements IDnsProvider {
    readonly name = "cloudns";
    readonly displayName = "ClouDNS";
    readonly credentialFields = [
        { name: "authId", description: "Auth ID (sub-auth-id or auth-id)", secret: false },
        { name: "authPassword", description: "Auth Password", secret: true },
    ];

    private baseUrl = "https://api.cloudns.net/dns";

    private async apiRequest(
        endpoint: string,
        params: Record<string, string>,
        credentials: Record<string, string>
    ): Promise<any> {
        const url = new URL(`${this.baseUrl}/${endpoint}`);
        const allParams = {
            "sub-auth-id": credentials.authId,
            "auth-password": credentials.authPassword,
            ...params,
        };

        // Use Node's built-in fetch (available in Node 20+)
        const response = await fetch(url.toString() + "?" + new URLSearchParams(allParams));
        const data = await response.json();

        if (data.status === "Failed") {
            throw new Error(`ClouDNS API error: ${data.statusDescription}`);
        }
        return data;
    }

    async createTxtRecord(
        domain: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>
    ): Promise<void> {
        // Extract the zone (base domain) from the full domain
        const zone = this.extractZone(domain);

        await this.apiRequest("add-record.json", {
            "domain-name": zone,
            "record-type": "TXT",
            host: recordName,
            record: value,
            ttl: "60",
        }, credentials);

        // Wait for DNS propagation
        await this.waitForPropagation(zone, recordName, value, credentials);
    }

    async deleteTxtRecord(
        domain: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>
    ): Promise<void> {
        const zone = this.extractZone(domain);

        // Find the record ID
        const records = await this.apiRequest("records.json", {
            "domain-name": zone,
            type: "TXT",
            host: recordName,
        }, credentials);

        for (const [id, record] of Object.entries(records)) {
            if ((record as any).record === value) {
                await this.apiRequest("delete-record.json", {
                    "domain-name": zone,
                    "record-id": id,
                }, credentials);
                break;
            }
        }
    }

    async testCredentials(credentials: Record<string, string>): Promise<boolean> {
        try {
            await this.apiRequest("login.json", {}, credentials);
            return true;
        } catch {
            return false;
        }
    }

    private extractZone(domain: string): string {
        // *.example.com → example.com
        // sub.example.com → example.com
        const parts = domain.replace("*.", "").split(".");
        return parts.slice(-2).join(".");
    }

    private async waitForPropagation(
        zone: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>,
        maxAttempts = 30,
        intervalMs = 10000
    ): Promise<void> {
        // Poll ClouDNS API to confirm record is available
        // Or use a simple delay (120 seconds is typical for DNS propagation)
        await new Promise(resolve => setTimeout(resolve, 120000));
    }
}

registerProvider(new ClouDNSProvider());
```

### `namecheap.ts` — Namecheap Implementation

**API Documentation:** https://www.namecheap.com/support/api/methods/

**Credential Fields:**
- `apiUser` — API username
- `apiKey` — API key
- `clientIp` — Whitelisted client IP

**Important Namecheap API limitation:** Namecheap's API uses `namecheap.domains.dns.setHosts` which **replaces ALL DNS records** for a domain. This means we need to:
1. Fetch all existing records
2. Add our TXT record to the list
3. Set all records (existing + new)
4. For cleanup: fetch all, remove our TXT, set the rest

```typescript
import { IDnsProvider, registerProvider } from "./provider";

class NamecheapProvider implements IDnsProvider {
    readonly name = "namecheap";
    readonly displayName = "Namecheap";
    readonly credentialFields = [
        { name: "apiUser", description: "API Username", secret: false },
        { name: "apiKey", description: "API Key", secret: true },
        { name: "clientIp", description: "Whitelisted Client IP", secret: false },
    ];

    private baseUrl = "https://api.namecheap.com/xml.response";

    private async apiRequest(
        command: string,
        params: Record<string, string>,
        credentials: Record<string, string>
    ): Promise<string> {
        const allParams = {
            ApiUser: credentials.apiUser,
            ApiKey: credentials.apiKey,
            UserName: credentials.apiUser,
            ClientIp: credentials.clientIp,
            Command: command,
            ...params,
        };

        const url = `${this.baseUrl}?${new URLSearchParams(allParams)}`;
        const response = await fetch(url);
        const xml = await response.text();

        if (xml.includes('Status="ERROR"')) {
            throw new Error(`Namecheap API error: ${this.extractError(xml)}`);
        }
        return xml;
    }

    async createTxtRecord(
        domain: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>
    ): Promise<void> {
        const { sld, tld } = this.splitDomain(domain);

        // 1. Get existing records
        const existingRecords = await this.getExistingRecords(sld, tld, credentials);

        // 2. Add new TXT record
        existingRecords.push({
            HostName: recordName,
            RecordType: "TXT",
            Address: value,
            TTL: "60",
        });

        // 3. Set all records
        await this.setRecords(sld, tld, existingRecords, credentials);

        // 4. Wait for propagation
        await new Promise(resolve => setTimeout(resolve, 120000));
    }

    async deleteTxtRecord(
        domain: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>
    ): Promise<void> {
        const { sld, tld } = this.splitDomain(domain);

        // 1. Get existing records
        const existingRecords = await this.getExistingRecords(sld, tld, credentials);

        // 2. Remove our TXT record
        const filtered = existingRecords.filter(
            r => !(r.HostName === recordName && r.RecordType === "TXT" && r.Address === value)
        );

        // 3. Set remaining records
        await this.setRecords(sld, tld, filtered, credentials);
    }

    async testCredentials(credentials: Record<string, string>): Promise<boolean> {
        try {
            await this.apiRequest("namecheap.domains.getList", {
                PageSize: "1",
            }, credentials);
            return true;
        } catch {
            return false;
        }
    }

    private splitDomain(domain: string): { sld: string; tld: string } {
        const clean = domain.replace("*.", "");
        const parts = clean.split(".");
        return {
            sld: parts.slice(0, -1).join("."),
            tld: parts.slice(-1)[0],
        };
    }

    // Helper methods for XML parsing and record management
    private async getExistingRecords(sld: string, tld: string, credentials: Record<string, string>): Promise<any[]> {
        // ... parse XML response from namecheap.domains.dns.getHosts
        return [];
    }

    private async setRecords(sld: string, tld: string, records: any[], credentials: Record<string, string>): Promise<void> {
        // ... call namecheap.domains.dns.setHosts with all records
    }

    private extractError(xml: string): string {
        // ... extract error message from XML response
        return "Unknown error";
    }
}

registerProvider(new NamecheapProvider());
```

### Internal `dns-challenge` Command

This is an internal command called by the certbot hook scripts. It's not listed in `--help`.

```typescript
// commands/dns-challenge.ts (internal)
export const command = "dns-challenge";
export const desc = false; // Hidden from help

export const builder: CommandBuilder = {
    action: { type: "string", required: true },      // "create" or "cleanup"
    domain: { type: "string", required: true },       // CERTBOT_DOMAIN
    token: { type: "string", required: true },        // CERTBOT_VALIDATION
    provider: { type: "string", required: true },     // DNS provider name
};

export const handler = async (argv: DnsChallengeArgs) => {
    const config = loadConfig(argv.target);
    const provider = getProvider(argv.provider);
    const credentials = config.dns[argv.provider];

    const recordName = "_acme-challenge";

    if (argv.action === "create") {
        await provider.createTxtRecord(
            argv.domain, recordName, argv.token, credentials
        );
    } else if (argv.action === "cleanup") {
        await provider.deleteTxtRecord(
            argv.domain, recordName, argv.token, credentials
        );
    }
};
```

## DNS Propagation Handling

After creating a TXT record, DNS propagation can take anywhere from 30 seconds to several minutes. Strategies:

1. **Simple delay** (120 seconds) — works for most cases
2. **Poll the DNS provider API** — check if record is visible
3. **Poll public DNS** — resolve `_acme-challenge.<domain>` against public DNS to verify

The implementation starts with a simple delay (120 seconds) and can be enhanced later with polling.

## Error Handling

| Error | Response |
|-------|----------|
| Provider not found | "Unknown DNS provider '<x>'. Available: cloudns, namecheap" |
| API authentication fails | "DNS API authentication failed. Check credentials with 'dns-setup'" |
| API rate limit | Retry with exponential backoff (max 3 attempts) |
| Record creation fails | Show API error, suggest verifying domain is managed by provider |
| Record deletion fails | Warn but don't fail (certbot will succeed regardless) |
| Namecheap: existing records lost | CRITICAL — always fetch all records first before setHosts |
| DNS propagation timeout | Warn but continue (certbot may still succeed) |

## Testing Requirements

- ClouDNS: API authentication works
- ClouDNS: TXT record creation and deletion
- Namecheap: API authentication works
- Namecheap: TXT record creation preserves existing records
- Namecheap: TXT record deletion preserves other records
- Provider registry correctly loads both providers
- Hook scripts are generated with correct paths
- Internal dns-challenge command dispatches to correct provider
- Staging environment can be used for DNS-01 challenges
