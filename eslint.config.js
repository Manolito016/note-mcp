import type { TSESLint } from "@typescript-eslint/utils";

const config: TSESLint.FlatConfig.ConfigArray = [
    {
        ignores: ["dist/**", "node_modules/**", "coverage/**"],
    },
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: await import("@typescript-eslint/parser"),
            parserOptions: {
                project: "./tsconfig.json",
            },
        },
        plugins: {
            "@typescript-eslint": await import("@typescript-eslint/eslint-plugin"),
        },
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-floating-promises": "error",
        },
    },
];

export default config;
