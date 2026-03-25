/**
 * DNS provider interface and registry for DNS-01 certificate challenges.
 *
 * Defines the common interface that all DNS providers must implement,
 * and provides a registry for discovering and instantiating providers.
 * New providers are added by creating an implementation file and
 * calling `registerProvider()`.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Describes a single credential field required by a DNS provider. */
export interface ICredentialField {
    /** Field name used as the key in the credentials record. */
    name: string;
    /** Human-readable description shown during dns-setup prompts. */
    description: string;
    /** If true, the value is masked in logs (passwords, API keys). */
    secret: boolean;
}

/**
 * Interface that all DNS providers must implement.
 *
 * Providers handle the creation and deletion of TXT records for
 * ACME DNS-01 challenges. Each provider also declares what credentials
 * it requires and can optionally test those credentials.
 */
export interface IDnsProvider {
    /** Internal provider name (e.g. "cloudns", "namecheap"). */
    readonly name: string;
    /** Human-readable display name (e.g. "ClouDNS", "Namecheap"). */
    readonly displayName: string;
    /** Credential fields required by this provider. */
    readonly credentialFields: ICredentialField[];

    /**
     * Create a TXT record for an ACME DNS-01 challenge.
     *
     * @param domain      - The full domain being certified.
     * @param recordName  - The TXT record name (e.g. "_acme-challenge").
     * @param value       - The validation token value.
     * @param credentials - Provider-specific API credentials.
     */
    createTxtRecord(
        domain: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>,
    ): Promise<void>;

    /**
     * Delete a TXT record after the ACME challenge is complete.
     *
     * @param domain      - The full domain being certified.
     * @param recordName  - The TXT record name (e.g. "_acme-challenge").
     * @param value       - The validation token value to match.
     * @param credentials - Provider-specific API credentials.
     */
    deleteTxtRecord(
        domain: string,
        recordName: string,
        value: string,
        credentials: Record<string, string>,
    ): Promise<void>;

    /**
     * Test whether the provided credentials are valid.
     *
     * @param credentials - Provider-specific API credentials.
     * @returns true if authentication succeeds.
     */
    testCredentials(credentials: Record<string, string>): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Provider Registry
// ---------------------------------------------------------------------------

/** Internal map of registered DNS providers keyed by name. */
const providers: Map<string, IDnsProvider> = new Map();

/**
 * Register a DNS provider implementation.
 *
 * Called at module load time by each provider's source file.
 *
 * @param provider - The provider instance to register.
 */
export function registerProvider(provider: IDnsProvider): void {
    providers.set(provider.name, provider);
}

/**
 * Get a registered DNS provider by name.
 *
 * @param name - The provider name (e.g. "cloudns").
 * @returns The provider instance, or undefined if not registered.
 */
export function getProvider(name: string): IDnsProvider | undefined {
    return providers.get(name);
}

/**
 * List all registered DNS providers.
 *
 * @returns Array of all registered provider instances.
 */
export function listProviders(): IDnsProvider[] {
    return Array.from(providers.values());
}

/**
 * Load all DNS provider implementations.
 *
 * Must be called before using getProvider() or listProviders() to
 * ensure the provider modules have executed their registerProvider() calls.
 */
export function loadProviders(): void {
    // Import each provider module — their top-level code registers them.
    require("./cloudns");
    require("./namecheap");
}
