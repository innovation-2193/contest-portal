const { join } = require("node:path");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(join(__dirname, ".."));
process.env.NODE_ENV = "production";
process.env.PORT = process.env.PORT || "3003";
process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
require("../.next/standalone/server.js");
