import type { SystemModes } from "@/contracts";
import { SyntheticBadge } from "./SyntheticBadge";

const STALL_MS = 30_000;
const MISCONFIGURED = "MISCONFIGURED — real provider selected, key missing";

function aiLabel(v: SystemModes["vision"]): { text: string; warn: boolean } {
  if (v.status === "misconfigured") return { text: `AI: ${MISCONFIGURED}`, warn: true };
  return { text: v.mode === "fake" ? "AI: FAKE" : `AI: REAL${v.model ? ` (${v.model})` : ""}`, warn: false };
}

function messagingLabel(m: SystemModes["messaging"]): { text: string; warn: boolean } {
  if (m.status === "misconfigured") return { text: `Messaging: ${MISCONFIGURED}`, warn: true };
  return {
    text: m.mode === "fake" ? "Messaging: SIMULATED" : "Messaging: REAL (iMessage)",
    warn: false,
  };
}

/** Both times come from the server (`generated_at`, `last_tick_at`); the client clock is never used. */
function schedulerStalled(modes: SystemModes, generated_at: string): boolean {
  if (!modes.last_tick_at) return true;
  return Date.parse(generated_at) - Date.parse(modes.last_tick_at) > STALL_MS;
}

export function ModeBanner({ modes, generated_at }: { modes: SystemModes; generated_at: string }) {
  const ai = aiLabel(modes.vision);
  const msg = messagingLabel(modes.messaging);
  const stalled = schedulerStalled(modes, generated_at);
  const chip = (text: string, warn: boolean) => (
    <span
      className={`rounded border px-2 py-0.5 text-xs font-semibold ${
        warn ? "border-amber-700 bg-amber-100 text-amber-950" : "border-slate-600 bg-white text-slate-900"
      }`}
    >
      {text}
    </span>
  );
  return (
    <div
      role="status"
      aria-label="System mode"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-400 bg-slate-100 px-4 py-2"
    >
      {chip(ai.text, ai.warn)}
      {chip(msg.text, msg.warn)}
      {chip(`Store: ${modes.store}`, false)}
      {modes.demo_accelerated && chip("DEMO: accelerated timers", false)}
      <SyntheticBadge />
      {stalled && (
        <span className="rounded border border-amber-700 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
          Scheduler stalled{modes.last_tick_at ? "" : " — no tick recorded"}
        </span>
      )}
    </div>
  );
}
