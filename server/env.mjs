import { readFileSync } from "node:fs";

// Fill empty process env from .env. Existing variables win, so tests can
// set HOLLER_STORE=memory and skip this file.
if (process.env.HOLLER_STORE !== "memory") {
  try {
    const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!key || value === "" || process.env[key]) continue;
      process.env[key] = value;
    }
  } catch {
    // No .env yet. npm start still runs.
  }
}
