const { join } = require("node:path");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(join(__dirname, ".."));
process.env.NODE_ENV = "production";
process.env.PORT = process.env.PORT || "3003";
process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
process.env.APP_STORAGE_DIR = process.env.APP_STORAGE_DIR || join(__dirname, "..", "storage");
require("../.next/standalone/server.js");
