import { initVault } from "./dist/utils/vault.js";
import { generateCanvas } from "./dist/tools/generate-hive-canvas.js";

try {
    const root = initVault();
    console.log("Vault root:", root);
    console.log("Generating hive canvas...");
    const result = await generateCanvas();
    console.log("Result:", JSON.stringify(result, null, 2));
} catch (err) {
    console.error("Error:", err.message);
    console.error(err.stack);
}
