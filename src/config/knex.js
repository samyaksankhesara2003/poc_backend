import path from "path";
import { fileURLToPath } from "url";
import baseConfig from "./knexConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    ...baseConfig,
    migrations: {
        directory: path.join(__dirname, "..", "migrations"),
        extension: "mjs",
        loadExtensions: [".js", ".mjs"],
    },
    seeds: {
        directory: path.join(__dirname, "..", "seeds"),
    },
};
