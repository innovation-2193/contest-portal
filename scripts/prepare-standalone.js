const { cpSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const standalone = join(root, ".next", "standalone");
mkdirSync(join(standalone, ".next"), { recursive: true });
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
console.log("Standalone assets prepared.");
