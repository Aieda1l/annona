// Slice 2 item 5: demo controls (Reset demo, Run tick now, Dispatch now). Only when the server reports demo mode.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoControls } from "@/components/dashboard/DemoControls";
import { OperatorDashboard } from "@/components/dashboard/OperatorDashboard";
import { fixtureSnapshot } from "@/components/dashboard/fixture-snapshot";
import { postJson, summarizeCounts } from "@/components/dashboard/api";

afterEach(cleanup);

describe("summarizeCounts", () => {
  it("lists numeric fields only and ignores the rest", () => {
    expect(summarizeCounts({ at: "x", expired_offers: 1, offers_sent: 2, note: "n" })).toBe("expired offers: 1 · offers sent: 2");
  });
  it("is empty for non-objects", () => {
    expect(summarizeCounts(null)).toBe("");
  });
});

describe("DemoControls", () => {
  it("Run tick now shows the returned counts", async () => {
    const onTick = vi.fn().mockResolvedValue({ ok: true, summary: "offers created: 1 · offers sent: 1" });
    render(<DemoControls onTick={onTick} onReset={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /run tick now/i }));
    });
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status", { name: /demo control result/i })).toHaveTextContent("offers created: 1");
  });

  it("shows the server error code verbatim", async () => {
    const onTick = vi.fn().mockResolvedValue({ ok: false, error: "NOT_AUTHORIZED: operator session required" });
    render(<DemoControls onTick={onTick} onReset={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /run tick now/i }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("NOT_AUTHORIZED: operator session required");
  });

  it("Reset demo needs an explicit confirmation", async () => {
    const onReset = vi.fn().mockResolvedValue({ ok: true, summary: "reset" });
    render(<DemoControls onTick={vi.fn()} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /^reset demo/i }));
    expect(onReset).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm reset/i }));
    });
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("OperatorDashboard demo handlers", () => {
  const demo = { onReset: vi.fn(), onTick: vi.fn(), onDispatch: vi.fn() };

  it("shows Dispatch now only on eligible cards", () => {
    render(<OperatorDashboard snapshot={fixtureSnapshot()} sourceLabel="x" onAction={vi.fn()} demo={demo} />);
    const buttons = screen.getAllByRole("button", { name: /dispatch now/i });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.closest("[data-testid=donation-card]")).toHaveAttribute(
      "data-donation-id",
      "00000000-0000-4000-8000-0000000000d1",
    );
    expect(screen.getByRole("button", { name: /run tick now/i })).toBeInTheDocument();
  });

  it("shows no demo controls without demo handlers", () => {
    render(<OperatorDashboard snapshot={fixtureSnapshot()} sourceLabel="x" onAction={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /dispatch now|run tick|reset demo/i })).toBeNull();
  });

  it("Dispatch now reports the outcome on the card", async () => {
    const onDispatch = vi.fn().mockResolvedValue({ ok: false, error: "INVALID_TRANSITION: not eligible now" });
    render(<OperatorDashboard snapshot={fixtureSnapshot()} sourceLabel="x" onAction={vi.fn()} demo={{ ...demo, onDispatch }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /dispatch now/i }));
    });
    expect(onDispatch).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000000d1");
    expect(screen.getByRole("alert", { name: /dispatch result/i })).toHaveTextContent("INVALID_TRANSITION");
  });
});

describe("failure visibility and in-flight locking", () => {
  it("shows a 2xx report with send_failures as a warning, not a clean success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true, data: { offers_created: 1, send_failures: 1 } }), { status: 200 })),
      ),
    );
    const out = await postJson("/api/internal/tick");
    vi.unstubAllGlobals();
    expect(out).toMatchObject({ ok: true, warn: true });
    render(<DemoControls onTick={() => Promise.resolve(out)} onReset={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /run tick now/i }));
    });
    expect(screen.getByRole("status", { name: /demo control result/i })).toHaveTextContent(/completed with failures/i);
  });

  it("does not treat a non-2xx response with ok:true as success", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true, data: {} }), { status: 502 }))));
    const out = await postJson("/x");
    vi.unstubAllGlobals();
    expect(out.ok).toBe(false);
  });

  it("keeps the dispatch result after the card leaves the eligible column", async () => {
    const demo = { onReset: vi.fn(), onTick: vi.fn(), onDispatch: vi.fn().mockResolvedValue({ ok: true, summary: "offers created: 1" }) };
    const { rerender } = render(<OperatorDashboard snapshot={fixtureSnapshot()} sourceLabel="x" onAction={vi.fn()} demo={demo} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /dispatch now/i }));
    });
    const moved = fixtureSnapshot();
    moved.donations = moved.donations.map((d) =>
      d.id === "00000000-0000-4000-8000-0000000000d1" ? { ...d, status: "offered" as const } : d,
    );
    rerender(<OperatorDashboard snapshot={moved} sourceLabel="x" onAction={vi.fn()} demo={demo} />);
    expect(screen.queryByRole("button", { name: /dispatch now/i })).toBeNull();
    expect(screen.getByRole("status", { name: /dispatch result/i })).toHaveTextContent("offers created: 1");
  });

  it("disables Dispatch now and tick while another demo action is in flight", async () => {
    let release!: (o: { ok: true; summary: string }) => void;
    const onTick = vi.fn(() => new Promise<{ ok: true; summary: string }>((r) => (release = r)));
    const demo = { onReset: vi.fn(), onTick, onDispatch: vi.fn() };
    render(<OperatorDashboard snapshot={fixtureSnapshot()} sourceLabel="x" onAction={vi.fn()} demo={demo} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /run tick now/i }));
    });
    expect(screen.getByRole("button", { name: /dispatch now/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /run tick now/i })).toBeDisabled();
    await act(async () => release({ ok: true, summary: "done" }));
    expect(screen.getByRole("button", { name: /dispatch now/i })).toBeEnabled();
  });
});
