import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/tools/stdio-integration.test.ts", "src/tools/adversarial.test.ts"],
        testTimeout: 30000,
        hookTimeout: 30000,
        teardownTimeout: 15000,
        fileParallelism: false,
        pool: "forks",
    },
});
