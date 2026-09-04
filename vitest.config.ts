import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
        exclude: ["node_modules/", "dist/", "src/tools/stdio-integration.test.ts", "src/tools/adversarial.test.ts"],
        testTimeout: 30000,
        hookTimeout: 15000,
        teardownTimeout: 5000,
        // Run test files sequentially to prevent vault path conflicts
        fileParallelism: false,
        pool: "forks",
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            exclude: ["node_modules/", "dist/"],
        },
    },
});
