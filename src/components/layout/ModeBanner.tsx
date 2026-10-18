import { AlertTriangle, Bot, Clock, Database, MessageSquare, Timer } from "lucide-react";
import type { SystemModes } from "@/contracts";
import { cn } from "cn";
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

function Chip({ text, warn, icon: Icon }: { text: string; warn: boolean; icon: typeof Bot }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        warn ? "border-review-border bg-review-subtle font-semibold text-review" : "border-border bg-card text-foreground/80",
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {text}
    </span>
  );
}

/** The provider-mode strip under the header. Truthful labels only; warnings stay loud (icon + text, not color alone). */
export function ModeBanner({ modes, generated_at }: { modes: SystemModes; generated_at: string }) {
  const ai = aiLabel(modes.vision);
  const msg = messagingLabel(modes.messaging);
  const stalled = schedulerStalled(modes, generated_at);
  return (
    <div role="status" aria-label="System mode" className="border-b border-border/70 bg-surface-sunken/70">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-1.5 px-4 py-1.5 sm:px-6">
        <Chip text={ai.text} warn={ai.warn} icon={ai.warn ? AlertTriangle : Bot} />
        <Chip text={msg.text} warn={msg.warn} icon={msg.warn ? AlertTriangle : MessageSquare} />
        <Chip text={`Store: ${modes.store}`} warn={false} icon={Database} />
        {modes.demo_accelerated && <Chip text="DEMO: accelerated timers" warn={false} icon={Timer} />}
        <SyntheticBadge />
        {stalled && (
          <Chip text={`Scheduler stalled${modes.last_tick_at ? "" : " — no tick recorded"}`} warn icon={Clock} />
        )}
      </div>
    </div>
  );
}
