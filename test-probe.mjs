import { symlinkSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const d = ".test-link-probe4";
mkdirSync(d, { recursive: true });
mkdirSync(join(d, "subdir"));
writeFileSync(join(d, "t.txt"), "x");

// Test 1: file symlink with explicit type
try {
    symlinkSync(join(d, "t.txt"), join(d, "file-link"), "file");
    console.log("file symlink OK");
    rmSync(join(d, "file-link"));
} catch (e) {
    console.log("file symlink FAIL:", e.code, e.message?.split("\n")[0]);
}

// Test 2: dir symlink with explicit type
try {
    symlinkSync(join(d, "subdir"), join(d, "dir-link"), "dir");
    console.log("dir symlink OK");
    rmSync(join(d, "dir-link"));
} catch (e) {
    console.log("dir symlink FAIL:", e.code, e.message?.split("\n")[0]);
}

// Test 3: junction
try {
    execSync(`mklink /J "${join(d, "junction")}" "${join(d, "subdir")}"`, { stdio: "pipe" });
    console.log("junction OK");
    rmSync(join(d, "junction"));
} catch (e) {
    const msg = e.stderr?.toString() || e.message;
    console.log("junction FAIL:", msg.split("\n")[0]);
}

rmSync(d, { recursive: true, force: true });
