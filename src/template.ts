/**
 * Template engine for rendering nginx configuration files.
 *
 * Templates use `%variable%` placeholder syntax. The engine reads a
 * template file from `dist/templates/`, replaces all placeholders with
 * provided data, validates that no unreplaced placeholders remain, and
 * writes the result to the specified output path.
 *
 * @packageDocumentation
 */

import fs from "fs";
import path from "path";

import { Logger } from "./logger";

// ---------------------------------------------------------------------------
// Template Rendering
// ---------------------------------------------------------------------------

/**
 * Render a template file by replacing `%variable%` placeholders with data.
 *
 * Reads the template from the `templates/` directory relative to the
 * compiled JavaScript output (__dirname), replaces all `%key%` tokens
 * with the corresponding value from the data map, and writes the result
 * to `outFile`.
 *
 * Warns (but does not fail) if any unreplaced placeholders remain after
 * substitution — this usually indicates a missing variable in the data map.
 *
 * @param templatePath - Relative path within the templates directory (e.g. "passthrough/site.conf").
 * @param data         - Key/value map of placeholder replacements.
 * @param outFile      - Absolute path to write the rendered output.
 * @param logger       - Logger instance for debug/warning output.
 */
export function renderTemplate(
    templatePath: string,
    data: Record<string, string>,
    outFile: string,
    logger: Logger,
): void {
    const fullPath = path.join(__dirname, "templates", templatePath);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Template not found: ${fullPath}`);
    }

    let template = fs.readFileSync(fullPath, "utf-8");

    // Replace all %variable% placeholders with provided values.
    for (const [key, value] of Object.entries(data)) {
        const placeholder = `%${key}%`;
        template = template.replaceAll(placeholder, value);
    }

    // Warn about any placeholders that were not replaced.
    const unreplaced = template.match(/%[a-zA-Z_]+%/g);
    if (unreplaced) {
        const unique = [...new Set(unreplaced)];
        logger.warn(`Template ${templatePath} has unreplaced placeholders: ${unique.join(", ")}`);
    }

    // Ensure the output directory exists, then write the rendered config.
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, template, "utf-8");
    logger.debug(`Rendered template ${templatePath} → ${outFile}`);
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Generate the nginx `upstream` server block entries from a list of addresses.
 *
 * Each upstream address (e.g. "127.0.0.1:3000") is formatted as an
 * indented `server` directive suitable for inclusion inside an
 * `upstream { ... }` block.
 *
 * @param upstreams - Array of `host:port` strings.
 * @returns Multi-line string of `    server <addr>;` lines.
 *
 * @example
 * ```ts
 * generateUpstreamServers(["127.0.0.1:3000", "127.0.0.1:3001"]);
 * // =>
 * //     server 127.0.0.1:3000;
 * //     server 127.0.0.1:3001;
 * ```
 */
export function generateUpstreamServers(upstreams: string[]): string {
    return upstreams.map((u) => `    server ${u};`).join("\n");
}

/**
 * Generate a valid nginx upstream block name from a domain.
 *
 * Replaces all non-alphanumeric characters with underscores and prefixes
 * with `backend_` to ensure the identifier is valid in nginx config.
 *
 * @param domain - The domain name (e.g. "api.example.com" or "*.example.com").
 * @returns A sanitised upstream name (e.g. "backend_api_example_com").
 */
export function generateUpstreamName(domain: string): string {
    return "backend_" + domain.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Generate the nginx `server_name` directive value from a domain.
 *
 * For wildcard domains (e.g. `*.example.com`), nginx needs both the
 * wildcard pattern and the bare domain to handle both `sub.example.com`
 * and `example.com` itself.
 *
 * @param domain   - The domain name.
 * @param wildcard - Whether this is a wildcard domain.
 * @returns The `server_name` value string.
 *
 * @example
 * ```ts
 * generateServerName("api.example.com", false);
 * // => "api.example.com"
 *
 * generateServerName("*.example.com", true);
 * // => "*.example.com example.com"
 * ```
 */
export function generateServerName(domain: string, wildcard: boolean): string {
    if (wildcard) {
        // *.example.com → need both the wildcard and the bare domain
        const baseDomain = domain.replace("*.", "");
        return `${domain} ${baseDomain}`;
    }
    return domain;
}
