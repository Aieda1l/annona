// Slice 2 polling: GET /api/dashboard every 2 s, pause while hidden, never fabricate data on failure.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveOperatorDashboard } from "@/components/dashboard/LiveOperatorDashboard";
import { fixtureSnapshot } from "@/components/dashboard/fixture-snapshot";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const okBody = () => ({ ok: true, data: fixtureSnapshot() });
const errBody = (code: string, message: string) => ({ ok: false, error: { code, message, retryable: false } });

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

let hidden = false;
beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LiveOperatorDashboard", () => {
  it("renders the server snapshot and polls every 2 s", async () => {
    const fetchMock = vi.fn((..._args: unknown[]) => json(okBody()));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveOperatorDashboard />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/dashboard");
    expect(screen.getByText(/Live server state/)).toBeInTheDocument();
    expect(screen.getAllByTestId("donation-card").length).toBeGreaterThan(0);
    await flush(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows the ErrorCode and fabricates nothing when the first load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(errBody("NOT_IMPLEMENTED", "getDashboardSnapshot is not implemented yet"), 501)));
    render(<LiveOperatorDashboard />);
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("NOT_IMPLEMENTED");
    expect(screen.queryAllByTestId("donation-card")).toHaveLength(0);
  });

  it("keeps the last snapshot labeled stale after a later failure, then recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json(okBody()))
      .mockImplementationOnce(() => json(errBody("PROVIDER_UNAVAILABLE", "store down"), 502))
      .mockImplementation(() => json(okBody()));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveOperatorDashboard />);
    await flush();
    await flush(2000);
    expect(screen.getByRole("alert")).toHaveTextContent("PROVIDER_UNAVAILABLE");
    expect(screen.getByText(/stale since/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("donation-card").length).toBeGreaterThan(0);
    await flush(2000);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/stale since/i)).toBeNull();
  });

  it("treats a network failure as UNREACHABLE", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
    render(<LiveOperatorDashboard />);
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("UNREACHABLE");
  });

  it("does not poll while the tab is hidden, and resumes when visible", async () => {
    const fetchMock = vi.fn((..._args: unknown[]) => json(okBody()));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveOperatorDashboard />);
    await flush();
    hidden = true;
    await flush(6000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows demo controls only in demo mode, and Run tick now posts to the tick route", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url === "/api/internal/tick") return json({ ok: true, data: { at: "x", offers_sent: 1 } });
        return json(okBody());
      }),
    );
    render(<LiveOperatorDashboard />);
    await flush();
    await act(async () => {
      screen.getByRole("button", { name: /run tick now/i }).click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toContain("POST /api/internal/tick");
    expect(screen.getByRole("status", { name: /demo control result/i })).toHaveTextContent("offers sent: 1");
  });

  it("hides demo controls when the server is not in demo mode", async () => {
    const snap = fixtureSnapshot();
    snap.modes.demo_accelerated = false;
    vi.stubGlobal("fetch", vi.fn(() => json({ ok: true, data: snap })));
    render(<LiveOperatorDashboard />);
    await flush();
    expect(screen.queryByRole("button", { name: /run tick now|reset demo|dispatch now/i })).toBeNull();
  });

  it("hides demo controls while the snapshot is stale", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json(okBody()))
      .mockImplementation(() => json(errBody("PROVIDER_UNAVAILABLE", "down"), 502));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveOperatorDashboard />);
    await flush();
    expect(screen.getByRole("button", { name: /run tick now/i })).toBeInTheDocument();
    await flush(2000);
    expect(screen.getByText(/stale since/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run tick now|reset demo|dispatch now/i })).toBeNull();
  });

  it("ignores an older poll that resolves after a newer one", async () => {
    const stale = fixtureSnapshot();
    stale.donations = [];
    let releaseOld!: () => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((r) => (releaseOld = () => r(new Response(JSON.stringify({ ok: true, data: stale }), { status: 200 })))))
      .mockImplementation(() => json(okBody()));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveOperatorDashboard />);
    await flush();
    await flush(2000);
    expect(screen.getAllByTestId("donation-card").length).toBeGreaterThan(0);
    await act(async () => releaseOld());
    expect(screen.getAllByTestId("donation-card").length).toBeGreaterThan(0);
  });

  it("Reset demo posts to /api/demo/reset with no body (CONTRACTS section 10 lists none)", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url === "/api/demo/reset") return json({ ok: true, data: { reset_at: "2026-10-17T23:00:00.000Z" } });
        return json(okBody());
      }),
    );
    render(<LiveOperatorDashboard />);
    await flush();
    await act(async () => {
      screen.getByRole("button", { name: /^reset demo/i }).click();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      screen.getByRole("button", { name: /confirm reset/i }).click();
      await vi.advanceTimersByTimeAsync(0);
    });
    const post = calls.find((c) => c.url === "/api/demo/reset")!;
    expect(post.init?.method).toBe("POST");
    expect(post.init?.body).toBeUndefined();
  });
});
