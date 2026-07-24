import { Hono } from "hono";
import type { AppEnv } from "../auth";

const app = new Hono<AppEnv>();

/**
 * Latest published version of the Chrome extension. Bump this together with
 * the "version" field in extension/manifest.json whenever you ship an extension
 * change. Installed copies compare their own version against this and prompt
 * the user to update when they're behind. Unauthenticated on purpose.
 */
const EXTENSION_LATEST = "1.0.0";

app.get("/extension/version", (c) => {
  return c.json({
    version: EXTENSION_LATEST,
    // Optional: a short note and a link shown in the update banner.
    notes: "",
    url: "",
  });
});

export default app;
