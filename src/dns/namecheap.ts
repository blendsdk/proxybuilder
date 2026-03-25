/**
 * Namecheap DNS provider for DNS-01 ACME challenges.
 *
 * Uses the Namecheap XML API to manage TXT records. Important limitation:
 * Namecheap's setHosts API replaces ALL DNS records, so we must fetch
 * all existing records before any modification.
 *
 * API docs: https://www.namecheap.com/support/api/methods/
 *
 * @packageDocumentation
 */

import { IDnsProvider, registerProvider } from "./provider";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.namecheap.com/xml.response";
const PROPAGATION_DELAY_MS = 120_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Simplified DNS record structure for Namecheap API. */
interface INamecheapRecord {
    HostName: string;
    RecordType: string;
    Address: string;
    TTL: string;
}

// ---------------------------------------------------------------------------
// Namecheap Provider
// ---------------------------------------------------------------------------

/**
 * Namecheap implementation of the DNS provider interface.
 *
 * CRITICAL: Namecheap's setHosts API replaces ALL records. Always
 * fetch existing records before adding/removing to avoid data loss.
 */
class NamecheapProvider implements IDnsProvider {
    readonly name = "namecheap";
    readonly displayName = "Namecheap";
    readonly credentialFields = [
        { name: "apiUser", description: "API Username", secret: false },
        { name: "apiKey", description: "API Key", secret: true },
        { name: "clientIp", description: "Whitelisted Client IP", secret: false },
    ];

    /**
     * Make an API request to the Namecheap XML API.
     *
     * @param command     - API command (e.g. "namecheap.domains.dns.getHosts").
     * @param params      - Additional request parameters.
     * @param credentials - API credentials.
     * @returns Raw XML response string.
     */
    protected async apiRequest(
        command: string,
        params: Record<string, string>,
        credentials: Record<string, string>,
    ): Promise<string> {
        const allParams = new URLSearchParams({
            ApiUser: credentials.apiUser,
            ApiKey: credentials.apiKey,
            UserName: credentials.apiUser,
            ClientIp: credentials.clientIp,
            Command: command,
            ...params,
        });

        const response = await fetch(`${BASE_URL}?${allParams}`);
        const xml = await response.text();

        if (xml.includes('Status="ERROR"')) {
            throw new Error(`Namecheap API error: ${this.extractError(xml)}`);
        }
        return xml;
    }

    /** @inheritdoc */
    async createTxtRecord(
        domain: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>,
    ): Promise<void> {
        const { sld, tld } = this.splitDomain(domain);
        const existing = await this.getExistingRecords(sld, tld, credentials);

        // Add the new TXT record to existing records.
        existing.push({ HostName: recordName, RecordType: "TXT", Address: value, TTL: "60" });

        await this.setRecords(sld, tld, existing, credentials);
        await new Promise((resolve) => setTimeout(resolve, PROPAGATION_DELAY_MS));
    }

    /** @inheritdoc */
    async deleteTxtRecord(
        domain: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>,
    ): Promise<void> {
        const { sld, tld } = this.splitDomain(domain);
        const existing = await this.getExistingRecords(sld, tld, credentials);

        // Remove only our specific TXT record, preserve everything else.
        const filtered = existing.filter(
            (r) => !(r.HostName === recordName && r.RecordType === "TXT" && r.Address === value),
        );

        await this.setRecords(sld, tld, filtered, credentials);
    }

    /** @inheritdoc */
    async testCredentials(credentials: Record<string, string>): Promise<boolean> {
        try {
            await this.apiRequest("namecheap.domains.getList", { PageSize: "1" }, credentials);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Split a domain into SLD and TLD components.
     *
     * @param domain - The domain (e.g. "*.example.com" → sld="example", tld="com").
     */
    protected splitDomain(domain: string): { sld: string; tld: string } {
        const clean = domain.replace("*.", "");
        const parts = clean.split(".");
        return { sld: parts.slice(0, -1).join("."), tld: parts[parts.length - 1] };
    }

    /**
     * Fetch all existing DNS records for a domain.
     *
     * @param sld         - Second-level domain.
     * @param tld         - Top-level domain.
     * @param credentials - API credentials.
     * @returns Array of existing records.
     */
    protected async getExistingRecords(
        sld: string,
        tld: string,
        credentials: Record<string, string>,
    ): Promise<INamecheapRecord[]> {
        const xml = await this.apiRequest(
            "namecheap.domains.dns.getHosts",
            { SLD: sld, TLD: tld },
            credentials,
        );

        // Parse host entries from XML response.
        const records: INamecheapRecord[] = [];
        const hostRegex = /HostName="([^"]*)"[^>]*RecordType="([^"]*)"[^>]*Address="([^"]*)"[^>]*TTL="([^"]*)"/g;
        let match: RegExpExecArray | null;
        while ((match = hostRegex.exec(xml)) !== null) {
            records.push({
                HostName: match[1],
                RecordType: match[2],
                Address: match[3],
                TTL: match[4],
            });
        }
        return records;
    }

    /**
     * Set all DNS records for a domain (replaces existing).
     *
     * @param sld         - Second-level domain.
     * @param tld         - Top-level domain.
     * @param records     - Complete list of records to set.
     * @param credentials - API credentials.
     */
    protected async setRecords(
        sld: string,
        tld: string,
        records: INamecheapRecord[],
        credentials: Record<string, string>,
    ): Promise<void> {
        const params: Record<string, string> = { SLD: sld, TLD: tld };

        // Namecheap expects indexed parameters: HostName1, RecordType1, etc.
        records.forEach((record, index) => {
            const i = index + 1;
            params[`HostName${i}`] = record.HostName;
            params[`RecordType${i}`] = record.RecordType;
            params[`Address${i}`] = record.Address;
            params[`TTL${i}`] = record.TTL;
        });

        await this.apiRequest("namecheap.domains.dns.setHosts", params, credentials);
    }

    /**
     * Extract an error message from Namecheap's XML error response.
     *
     * @param xml - The raw XML response.
     * @returns Extracted error message or "Unknown error".
     */
    protected extractError(xml: string): string {
        const match = xml.match(/<Error[^>]*>([^<]+)<\/Error>/);
        return match?.[1] ?? "Unknown error";
    }
}

registerProvider(new NamecheapProvider());
