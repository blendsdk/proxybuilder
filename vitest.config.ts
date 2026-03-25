import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Test file pattern — tests live in tests/ directory.
        include: ["tests/**/*.test.ts"],
        // Timeout per test (10 seconds — generous for fs-based tests).
        testTimeout: 10_000,
        // Reporter for clear output.
        reporters: ["verbose"],
    },
});
