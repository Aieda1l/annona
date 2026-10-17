// T-UI-04: truthful mode labeling. Fake vs real vs misconfigured, stalled scheduler, masked identities.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { IdentitySummary, SystemModes } from "@/contracts";
import { ModeBanner } from "@/components/layout/ModeBanner";
import { SyntheticBadge } from "@/components/layout/SyntheticBadge";
import { IdentityList } from "@/components/dashboard/IdentityList";

afterEach(cleanup);

const NOW = "2026-10-17T23:00:00.000Z";
const base: SystemModes = {
  vision: { mode: "fake", provider: "fake", model: null, status: "ok" },
  messaging: { mode: "fake", provider: "fake", channel: "simulated", status: "ok" },
  store: "pglite",
  demo_accelerated: true,
  last_tick_at: "2026-10-17T22:59:55.000Z",
  policy_version: "2026-10-17.1",
};

describe("T-UI-04 ModeBanner", () => {
  it("names each fake provider, store and accelerated timers", () => {
    render(<ModeBanner modes={base} generated_at={NOW} />);
    const banner = screen.getByRole("status", { name: /system mode/i });
    expect(banner).toHaveTextContent("AI: FAKE");
    expect(banner).toHaveTextContent("Messaging: SIMULATED");
    expect(banner).toHaveTextContent("pglite");
    expect(banner).toHaveTextContent("DEMO: accelerated timers");
    expect(banner).toHaveTextContent("Synthetic data");
    expect(screen.queryByText(/Scheduler stalled/)).toBeNull();
  });

  it("shows misconfigured real messaging, never SIMULATED or a healthy real label", () => {
    const modes: SystemModes = {
      ...base,
      messaging: { mode: "real", provider: "photon", channel: "imessage", status: "misconfigured" },
    };
    render(<ModeBanner modes={modes} generated_at={NOW} />);
    const banner = screen.getByRole("status", { name: /system mode/i });
    expect(banner).toHaveTextContent("AI: FAKE");
    expect(banner).toHaveTextContent("Messaging: MISCONFIGURED — real provider selected, key missing");
    expect(banner).not.toHaveTextContent("SIMULATED");
    expect(banner).not.toHaveTextContent("Messaging: REAL");
  });

  it("shows misconfigured real AI", () => {
    const modes: SystemModes = {
      ...base,
      vision: { mode: "real", provider: "gemini", model: "m", status: "misconfigured" },
    };
    render(<ModeBanner modes={modes} generated_at={NOW} />);
    expect(screen.getByRole("status", { name: /system mode/i })).toHaveTextContent(
      "AI: MISCONFIGURED — real provider selected, key missing",
    );
  });

  it("labels healthy real providers as real", () => {
    const modes: SystemModes = {
      ...base,
      demo_accelerated: false,
      vision: { mode: "real", provider: "gemini", model: "gemini-x", status: "ok" },
      messaging: { mode: "real", provider: "photon", channel: "imessage", status: "ok" },
    };
    render(<ModeBanner modes={modes} generated_at={NOW} />);
    const banner = screen.getByRole("status", { name: /system mode/i });
    expect(banner).toHaveTextContent("AI: REAL");
    expect(banner).toHaveTextContent("Messaging: REAL");
    expect(banner).not.toHaveTextContent("DEMO: accelerated timers");
  });

  it("warns when the scheduler is stalled (> 30 s) from server times only", () => {
    render(<ModeBanner modes={{ ...base, last_tick_at: "2026-10-17T22:59:15.000Z" }} generated_at={NOW} />);
    expect(screen.getByText(/Scheduler stalled/)).toBeInTheDocument();
  });

  it("warns when no tick has ever run", () => {
    render(<ModeBanner modes={{ ...base, last_tick_at: null }} generated_at={NOW} />);
    expect(screen.getByText(/Scheduler stalled/)).toBeInTheDocument();
  });
});

describe("T-UI-04 SyntheticBadge", () => {
  it("says synthetic data", () => {
    render(<SyntheticBadge />);
    expect(screen.getByText(/Synthetic data/)).toBeInTheDocument();
  });
});

describe("T-UI-04 IdentityList", () => {
  const ids: IdentitySummary[] = [
    {
      identity_id: "00000000-0000-4000-8000-0000000000e1",
      actor_role: "courier",
      actor_id: "00000000-0000-4000-8000-0000000000c1",
      actor_display_name: "Courier A (synthetic)",
      provider: "fake",
      status: "joined",
      joined_at: "2026-10-17T22:00:00.000Z",
      handle_masked: "••••1234",
    },
    {
      identity_id: "00000000-0000-4000-8000-0000000000e2",
      actor_role: "courier",
      actor_id: "00000000-0000-4000-8000-0000000000c2",
      actor_display_name: "Courier B (synthetic)",
      provider: "fake",
      status: "opted_out",
      joined_at: null,
      handle_masked: "••••9876",
    },
  ];

  it("shows each JOIN status with masked handle", () => {
    render(<IdentityList identities={ids} />);
    expect(screen.getByText("Courier A (synthetic)")).toBeInTheDocument();
    expect(screen.getByText("Courier B (synthetic)")).toBeInTheDocument();
    expect(screen.getByTestId("identity-status-00000000-0000-4000-8000-0000000000e1")).toHaveTextContent(/joined/i);
    expect(screen.getByTestId("identity-status-00000000-0000-4000-8000-0000000000e2")).toHaveTextContent(/opted out/i);
    expect(screen.getByText("••••1234")).toBeInTheDocument();
    expect(screen.getByText("••••9876")).toBeInTheDocument();
  });

  it("never exposes more than the last 4 characters of a handle", () => {
    const { container } = render(<IdentityList identities={ids} />);
    expect(container.textContent).not.toMatch(/\d{5,}/);
  });
});
