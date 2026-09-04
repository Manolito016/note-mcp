/**
 * Copy production templates from templates/ to dist/templates/.
 * Fails loudly if a required template is missing or cannot be copied.
 */
import { cpSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const distTemplates = resolve(projectRoot, "dist", "templates");
const srcTemplates = resolve(projectRoot, "templates");

const REQUIRED_TEMPLATES = ["hive-canvas-footer.tsx"];

// Verify source templates directory exists
if (!existsSync(srcTemplates)) {
    console.error(`ERROR: Templates directory not found: ${srcTemplates}`);
    console.error("Production templates must exist in the 'templates/' directory at the project root.");
    process.exit(1);
}

// Verify each required template exists and is readable
for (const template of REQUIRED_TEMPLATES) {
    const templatePath = resolve(srcTemplates, template);
    if (!existsSync(templatePath)) {
        console.error(`ERROR: Required production template missing: templates/${template}`);
        process.exit(1);
    }
    try {
        readFileSync(templatePath, "utf-8");
    } catch (err) {
        console.error(`ERROR: Cannot read required production template: templates/${template}`);
        console.error(`  ${err.message}`);
        process.exit(1);
    }
}

// Copy templates to dist
try {
    mkdirSync(distTemplates, { recursive: true });
    cpSync(srcTemplates, distTemplates, { recursive: true });
} catch (err) {
    console.error(`ERROR: Failed to copy templates to dist/`);
    console.error(`  ${err.message}`);
    process.exit(1);
}

// Verify packaged templates match source
for (const template of REQUIRED_TEMPLATES) {
    const srcContent = readFileSync(resolve(srcTemplates, template), "utf-8");
    const distContent = readFileSync(resolve(distTemplates, template), "utf-8");
    if (srcContent !== distContent) {
        console.error(`ERROR: Packaged template does not match source: ${template}`);
        process.exit(1);
    }
}

console.log(`Copied ${REQUIRED_TEMPLATES.length} template(s) to dist/templates/ (verified).`);
