import { z } from "zod";

// CONTRACTS §12. Parsed lazily (per call) so `next build` runs with no env and tests can set env.
// Empty strings (a copied .env.example) count as unset. Lanes never read process.env directly.
// Handles are personal data: trimmed, never validated by echoing, never logged (CONTRACTS §12).

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

// Whitespace-only counts as unset; surrounding whitespace is removed.
const trimmed = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t === "" ? undefined : t;
}, z.string().optional());

const EnvSchema = z.object({
  ANNONA_DEMO_MODE: optional(z.string()),
  STORE: optional(z.enum(["pglite", "postgres"])),
  PGLITE_DIR: optional(z.string()),
  DATABASE_URL: optional(z.string()),
  VISION_PROVIDER: optional(z.enum(["fake", "gemini"])),
  GEMINI_API_KEY: optional(z.string()),
  GEMINI_MODEL: optional(z.string()),
  // Optional second-opinion model for unconfident drafts; the literal "off" disables it (Dev 1 owns the meaning).
  GEMINI_ESCALATION_MODEL: optional(z.string()),
  MESSAGING_PROVIDER: optional(z.enum(["fake", "photon"])),
  PHOTON_PROJECT_ID: optional(z.string()),
  PHOTON_API_KEY: optional(z.string()),
  SESSION_SECRET: optional(z.string()),
  DEMO_PASSCODE: optional(z.string()),
  APP_BASE_URL: optional(z.string()),
  // Messaging (Dev 3).
  PHOTON_WEBHOOK_SECRET: optional(z.string()),
  PHOTON_INBOUND_MODE: optional(z.enum(["webhook", "socket", "poll"])),
  TICK_INTERVAL_MS: optional(z.coerce.number().int().min(500)),
  ANNONA_INTERNAL_SECRET: optional(z.string()),
  // Seed and gated tests (Dev 2). Handles are opted-in teammates' real handles: personal data.
  TEST_DATABASE_URL: optional(z.string()),
  DEMO_DONOR_HANDLE: trimmed,
  DEMO_COURIER_A_HANDLE: trimmed,
  DEMO_COURIER_B_HANDLE: trimmed,
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
  gemini_escalation_model: string | undefined;
  messaging_provider: "fake" | "photon";
  photon_project_id: string | undefined;
  photon_api_key: string | undefined;
  session_secret: string | undefined;
  demo_passcode: string | undefined;
  app_base_url: string | undefined;
  /** Server-only. Authenticates the relay worker on the tick and inbound routes. Unset keeps that path closed. */
  internal_secret: string | undefined;
  photon_webhook_secret: string | undefined;
  photon_inbound_mode: "webhook" | "socket" | "poll";
  tick_interval_ms: number;
  /** Disposable database for gated tests only. Never the shared demo DB. */
  test_database_url: string | undefined;
  demo_donor_handle: string | undefined;
  demo_courier_a_handle: string | undefined;
  demo_courier_b_handle: string | undefined;
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
    gemini_escalation_model: raw.GEMINI_ESCALATION_MODEL,
    messaging_provider: raw.MESSAGING_PROVIDER ?? "fake",
    photon_project_id: raw.PHOTON_PROJECT_ID,
    photon_api_key: raw.PHOTON_API_KEY,
    session_secret: raw.SESSION_SECRET,
    demo_passcode: raw.DEMO_PASSCODE,
    app_base_url: raw.APP_BASE_URL,
    internal_secret: raw.ANNONA_INTERNAL_SECRET,
    photon_webhook_secret: raw.PHOTON_WEBHOOK_SECRET,
    photon_inbound_mode: raw.PHOTON_INBOUND_MODE ?? "poll",
    tick_interval_ms: raw.TICK_INTERVAL_MS ?? 5000,
    test_database_url: raw.TEST_DATABASE_URL,
    demo_donor_handle: raw.DEMO_DONOR_HANDLE,
    demo_courier_a_handle: raw.DEMO_COURIER_A_HANDLE,
    demo_courier_b_handle: raw.DEMO_COURIER_B_HANDLE,
  };
}
