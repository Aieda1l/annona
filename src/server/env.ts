import { z } from "zod";

// CONTRACTS §12. Parsed lazily (per call) so `next build` runs with no env and tests can set env.
// Empty strings (a copied .env.example) count as unset. Lanes never read process.env directly.
// Contracts-2 adds the remaining §12 names (TICK_INTERVAL_MS, TEST_DATABASE_URL, DEMO_*_HANDLE, ...).

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const EnvSchema = z.object({
  ANNONA_DEMO_MODE: optional(z.string()),
  STORE: optional(z.enum(["pglite", "postgres"])),
  PGLITE_DIR: optional(z.string()),
  DATABASE_URL: optional(z.string()),
  VISION_PROVIDER: optional(z.enum(["fake", "gemini"])),
  GEMINI_API_KEY: optional(z.string()),
  GEMINI_MODEL: optional(z.string()),
  MESSAGING_PROVIDER: optional(z.enum(["fake", "photon"])),
  PHOTON_PROJECT_ID: optional(z.string()),
  PHOTON_API_KEY: optional(z.string()),
  SESSION_SECRET: optional(z.string()),
  DEMO_PASSCODE: optional(z.string()),
  APP_BASE_URL: optional(z.string()),
});

export type RawEnv = z.infer<typeof EnvSchema>;

export type Env = {
  demo_mode: boolean;
  store: "pglite" | "postgres";
  pglite_dir: string;
  database_url: string | undefined;
  vision_provider: "fake" | "gemini";
  gemini_api_key: string | undefined;
  gemini_model: string | undefined;
  messaging_provider: "fake" | "photon";
  photon_project_id: string | undefined;
  photon_api_key: string | undefined;
  session_secret: string | undefined;
  demo_passcode: string | undefined;
  app_base_url: string | undefined;
};

/** An unset provider variable means `fake`. A real provider with a missing key is passed through (never silently fake). */
export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const raw = EnvSchema.parse(source);
  return {
    demo_mode: raw.ANNONA_DEMO_MODE === "1",
    store: raw.STORE ?? "pglite",
    pglite_dir: raw.PGLITE_DIR ?? ".data/pglite",
    database_url: raw.DATABASE_URL,
    vision_provider: raw.VISION_PROVIDER ?? "fake",
    gemini_api_key: raw.GEMINI_API_KEY,
    gemini_model: raw.GEMINI_MODEL,
    messaging_provider: raw.MESSAGING_PROVIDER ?? "fake",
    photon_project_id: raw.PHOTON_PROJECT_ID,
    photon_api_key: raw.PHOTON_API_KEY,
    session_secret: raw.SESSION_SECRET,
    demo_passcode: raw.DEMO_PASSCODE,
    app_base_url: raw.APP_BASE_URL,
  };
}
