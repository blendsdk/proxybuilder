/**
 * Tests for the DNS provider registry and provider implementations.
 *
 * Tests the provider registry (register, get, list) and validates
 * that ClouDNS and Namecheap providers are correctly registered
 * with their expected credential fields and display names.
 *
 * Note: Actual API calls (createTxtRecord, deleteTxtRecord) are NOT
 * tested here — they require real DNS provider credentials and would
 * make external HTTP requests.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeAll } from "vitest";

import {
    getProvider,
    listProviders,
    registerProvider,
} from "../src/dns/provider";

// Import provider modules directly so their top-level registerProvider()
// calls execute. The loadProviders() function uses require() which doesn't
// resolve correctly in vitest's TypeScript transform environment.
import "../src/dns/cloudns";
import "../src/dns/namecheap";

// ---------------------------------------------------------------------------
// Provider Registry
// ---------------------------------------------------------------------------

describe("DNS Provider Registry", () => {
    it("should load at least 2 providers (cloudns, namecheap)", () => {
        const providers = listProviders();
        expect(providers.length).toBeGreaterThanOrEqual(2);
    });

    it("should find the cloudns provider by name", () => {
        const provider = getProvider("cloudns");
        expect(provider).toBeDefined();
        expect(provider!.name).toBe("cloudns");
    });

    it("should find the namecheap provider by name", () => {
        const provider = getProvider("namecheap");
        expect(provider).toBeDefined();
        expect(provider!.name).toBe("namecheap");
    });

    it("should return undefined for an unknown provider", () => {
        const provider = getProvider("nonexistent_provider");
        expect(provider).toBeUndefined();
    });

    it("should list all registered providers", () => {
        const providers = listProviders();
        const names = providers.map((p) => p.name);
        expect(names).toContain("cloudns");
        expect(names).toContain("namecheap");
    });
});

// ---------------------------------------------------------------------------
// ClouDNS Provider
// ---------------------------------------------------------------------------

describe("ClouDNS Provider", () => {
    it("should have the correct display name", () => {
        const provider = getProvider("cloudns")!;
        expect(provider.displayName).toBe("ClouDNS");
    });

    it("should require authId and authPassword credentials", () => {
        const provider = getProvider("cloudns")!;
        const fieldNames = provider.credentialFields.map((f) => f.name);
        expect(fieldNames).toContain("authId");
        expect(fieldNames).toContain("authPassword");
    });

    it("should mark authPassword as secret", () => {
        const provider = getProvider("cloudns")!;
        const passwordField = provider.credentialFields.find((f) => f.name === "authPassword");
        expect(passwordField).toBeDefined();
        expect(passwordField!.secret).toBe(true);
    });

    it("should not mark authId as secret", () => {
        const provider = getProvider("cloudns")!;
        const idField = provider.credentialFields.find((f) => f.name === "authId");
        expect(idField).toBeDefined();
        expect(idField!.secret).toBe(false);
    });

    it("should have descriptions for all credential fields", () => {
        const provider = getProvider("cloudns")!;
        provider.credentialFields.forEach((field) => {
            expect(field.description).toBeTruthy();
            expect(field.description.length).toBeGreaterThan(0);
        });
    });

    it("should implement createTxtRecord as a function", () => {
        const provider = getProvider("cloudns")!;
        expect(typeof provider.createTxtRecord).toBe("function");
    });

    it("should implement deleteTxtRecord as a function", () => {
        const provider = getProvider("cloudns")!;
        expect(typeof provider.deleteTxtRecord).toBe("function");
    });

    it("should implement testCredentials as a function", () => {
        const provider = getProvider("cloudns")!;
        expect(typeof provider.testCredentials).toBe("function");
    });
});

// ---------------------------------------------------------------------------
// Namecheap Provider
// ---------------------------------------------------------------------------

describe("Namecheap Provider", () => {
    it("should have the correct display name", () => {
        const provider = getProvider("namecheap")!;
        expect(provider.displayName).toBe("Namecheap");
    });

    it("should require apiUser, apiKey, and clientIp credentials", () => {
        const provider = getProvider("namecheap")!;
        const fieldNames = provider.credentialFields.map((f) => f.name);
        expect(fieldNames).toContain("apiUser");
        expect(fieldNames).toContain("apiKey");
        expect(fieldNames).toContain("clientIp");
    });

    it("should mark apiKey as secret", () => {
        const provider = getProvider("namecheap")!;
        const keyField = provider.credentialFields.find((f) => f.name === "apiKey");
        expect(keyField).toBeDefined();
        expect(keyField!.secret).toBe(true);
    });

    it("should not mark apiUser as secret", () => {
        const provider = getProvider("namecheap")!;
        const userField = provider.credentialFields.find((f) => f.name === "apiUser");
        expect(userField).toBeDefined();
        expect(userField!.secret).toBe(false);
    });

    it("should not mark clientIp as secret", () => {
        const provider = getProvider("namecheap")!;
        const ipField = provider.credentialFields.find((f) => f.name === "clientIp");
        expect(ipField).toBeDefined();
        expect(ipField!.secret).toBe(false);
    });

    it("should have descriptions for all credential fields", () => {
        const provider = getProvider("namecheap")!;
        provider.credentialFields.forEach((field) => {
            expect(field.description).toBeTruthy();
            expect(field.description.length).toBeGreaterThan(0);
        });
    });

    it("should implement all required IDnsProvider methods", () => {
        const provider = getProvider("namecheap")!;
        expect(typeof provider.createTxtRecord).toBe("function");
        expect(typeof provider.deleteTxtRecord).toBe("function");
        expect(typeof provider.testCredentials).toBe("function");
    });
});
