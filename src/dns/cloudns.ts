/**
 * ClouDNS DNS provider for DNS-01 ACME challenges.
 *
 * Uses the ClouDNS HTTP API to create and delete TXT records
 * required for wildcard SSL certificate provisioning.
 *
 * API docs: https://www.cloudns.net/wiki/article/42/
 *
 * @packageDocumentation
 */

import { IDnsProvider, registerProvider } from "./provider";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ClouDNS API base URL. */
const BASE_URL = "https://api.cloudns.net/dns";

/** DNS propagation wait time in milliseconds (2 minutes). */
const PROPAGATION_DELAY_MS = 120_000;

// ---------------------------------------------------------------------------
// ClouDNS Provider
// ---------------------------------------------------------------------------

/**
 * ClouDNS implementation of the DNS provider interface.
 *
 * Supports TXT record creation/deletion for ACME DNS-01 challenges
 * using sub-auth-id authentication.
 */
class ClouDNSProvider implements IDnsProvider {
    readonly name = "cloudns";
    readonly displayName = "ClouDNS";
    readonly credentialFields = [
        { name: "authId", description: "Auth ID (sub-auth-id or auth-id)", secret: false },
        { name: "authPassword", description: "Auth Password", secret: true },
    ];

    /**
     * Make an API request to the ClouDNS API.
     *
     * Appends authentication parameters and handles error responses.
     *
     * @param endpoint    - API endpoint path (e.g. "add-record.json").
     * @param params      - Request parameters.
     * @param credentials - Auth credentials.
     * @returns Parsed JSON response.
     */
    protected async apiRequest(
        endpoint: string,
        params: Record<string, string>,
        credentials: Record<string, string>,
    ): Promise<Record<string, unknown>> {
        const allParams = new URLSearchParams({
            "sub-auth-id": credentials.authId,
            "auth-password": credentials.authPassword,
            ...params,
        });

        const response = await fetch(`${BASE_URL}/${endpoint}?${allParams}`);
        const data = (await response.json()) as Record<string, unknown>;

        if (data.status === "Failed") {
            throw new Error(`ClouDNS API error: ${data.statusDescription}`);
        }

        return data;
    }

    /** @inheritdoc */
    async createTxtRecord(
        domain: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>,
    ): Promise<void> {
        const zone = this.extractZone(domain);

        await this.apiRequest("add-record.json", {
            "domain-name": zone,
            "record-type": "TXT",
            host: recordName,
            record: value,
            ttl: "60",
        }, credentials);

        // Wait for DNS propagation before certbot verifies.
        await new Promise((resolve) => setTimeout(resolve, PROPAGATION_DELAY_MS));
    }

    /** @inheritdoc */
    async deleteTxtRecord(
        domain: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>,
    ): Promise<void> {
        const zone = this.extractZone(domain);

        // Find the record ID by listing TXT records and matching the value.
        const records = await this.apiRequest("records.json", {
            "domain-name": zone,
            type: "TXT",
            host: recordName,
        }, credentials);

        for (const [id, record] of Object.entries(records)) {
            const rec = record as Record<string, unknown>;
            if (rec.record === value) {
                await this.apiRequest("delete-record.json", {
                    "domain-name": zone,
                    "record-id": id,
                }, credentials);
                break;
            }
        }
    }

    /** @inheritdoc */
    async testCredentials(credentials: Record<string, string>): Promise<boolean> {
        try {
            await this.apiRequest("login.json", {}, credentials);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Extract the base zone (registrable domain) from a full domain.
     *
     * @param domain - Full domain (e.g. "*.example.com", "sub.example.com").
     * @returns The zone (e.g. "example.com").
     */
    protected extractZone(domain: string): string {
        const parts = domain.replace("*.", "").split(".");
        return parts.slice(-2).join(".");
    }
}

// Register this provider so it's available via getProvider("cloudns").
registerProvider(new ClouDNSProvider());
