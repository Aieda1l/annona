// Slice 2 item 6: simulated phone. Labeled, fake-mode only, posts through the same inbound route as Photon.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorDashboard } from "@/components/dashboard/OperatorDashboard";
import { SimulatedPhone } from "@/components/phone/SimulatedPhone";
import { fixtureSnapshot } from "@/components/dashboard/fixture-snapshot";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const COURIER_ID = "00000000-0000-4000-8000-0000000000f1";
const claimResult = (code: string, message: string) => ({
  code,
  offer_id: null,
  donation_id: null,
  donation_status: null,
  assignment: null,
  message_for_actor: message,
});

type Route = (url: string, init?: RequestInit) => Promise<Response> | undefined;
function stubFetch(extra: Route = () => undefined, snap = fixtureSnapshot()) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const custom = extra(url, init);
    if (custom) return custom;
    if (url === "/api/dashboard") return json({ ok: true, data: snap });
    if (url.startsWith("/api/messaging/simulated/thread")) return json({ ok: true, data: { messages: [] } });
    return json({ ok: false, error: { code: "NOT_FOUND", message: "x", retryable: false } }, 404);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}
// Dashboard loads first, then the thread for the selected contact: settle both.
const flush = async () => {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SimulatedPhone", () => {
  it("is labeled as a simulation, not iMessage", async () => {
    stubFetch();
    render(<SimulatedPhone />);
    await flush();
    expect(screen.getByText("SIMULATED PHONE — not iMessage")).toBeInTheDocument();
  });

  it("is disabled when real messaging is active, with no send controls", async () => {
    const snap = fixtureSnapshot();
    snap.modes.messaging = { mode: "real", provider: "photon", channel: "imessage", status: "ok" };
    stubFetch(() => undefined, snap);
    render(<SimulatedPhone />);
    await flush();
    expect(screen.getByText(/Simulated phone disabled: real messaging is active/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^JOIN$/ })).toBeNull();
  });

  it("renders the disabled notice when the server answers 403", async () => {
    stubFetch((url) =>
      url.startsWith("/api/messaging/simulated/thread")
        ? json({ ok: false, error: { code: "NOT_AUTHORIZED", message: "no", retryable: false } }, 403)
        : undefined,
    );
    render(<SimulatedPhone />);
    await flush();
    expect(screen.getByText(/Simulated phone disabled: real messaging is active/)).toBeInTheDocument();
  });

  it("offers one thread per identity, showing only masked handles", async () => {
    stubFetch();
    render(<SimulatedPhone />);
    await flush();
    const picker = screen.getByRole("combobox", { name: /simulated contact/i });
    expect(picker.querySelectorAll("option").length).toBe(fixtureSnapshot().identities.length);
    expect(document.body.textContent).toContain("••••0001");
    expect(document.body.textContent).not.toMatch(/\d{5,}/);
  });

  it("sends YES <code> as { identity_id, text } and shows the claim outcome without success styling", async () => {
    const calls = stubFetch((url) =>
      url === "/api/messaging/simulated/inbound"
        ? json({
            ok: true,
            data: {
              outcome: "processed",
              command: "accept",
              claim_result: claimResult("offer_expired", "That offer has ended."),
              reply: null,
            },
          })
        : undefined,
    );
    render(<SimulatedPhone />);
    await flush();
    fireEvent.change(screen.getByLabelText(/offer code/i), { target: { value: "k7m3" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^YES$/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    const post = calls.find((c) => c.url === "/api/messaging/simulated/inbound")!;
    expect(JSON.parse(post.init!.body as string)).toEqual({ identity_id: COURIER_ID, text: "YES K7M3" });
    expect(screen.getByTestId("claim-headline")).toHaveTextContent("Expired — no assignment made");
    expect(screen.getByTestId("claim-result")).not.toHaveAttribute("data-tone", "success");
  });

  it("sends a fixture photo as { identity_id, text: '', fixture_id }", async () => {
    const calls = stubFetch((url) =>
      url === "/api/messaging/simulated/inbound"
        ? json({ ok: true, data: { outcome: "processed", command: "photo", reply: null } })
        : undefined,
    );
    render(<SimulatedPhone />);
    await flush();
    fireEvent.change(screen.getByLabelText(/fixture photo id/i), { target: { value: "pasta-tray" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send fixture photo/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
    const post = calls.find((c) => c.url === "/api/messaging/simulated/inbound")!;
    expect(JSON.parse(post.init!.body as string)).toEqual({ identity_id: COURIER_ID, text: "", fixture_id: "pasta-tray" });
  });

  it("shows a server refusal verbatim", async () => {
    stubFetch((url) =>
      url === "/api/messaging/simulated/inbound"
        ? json({ ok: false, error: { code: "VALIDATION_FAILED", message: "bad text", retryable: false } }, 400)
        : undefined,
    );
    render(<SimulatedPhone />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^JOIN$/ }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("VALIDATION_FAILED: bad text");
  });

  it("renders thread messages and turns a /v link into a same-origin link", async () => {
    stubFetch((url) =>
      url.startsWith("/api/messaging/simulated/thread")
        ? json({
            ok: true,
            data: {
              messages: [
                { id: "m1", direction: "outbound", text: "AI guess: pasta. Check: https://demo.example.invalid/v#abc123", created_at: "2026-10-17T23:00:00.000Z" },
                { id: "m2", direction: "inbound", text: "JOIN", created_at: "2026-10-17T22:59:00.000Z" },
              ],
            },
          })
        : undefined,
    );
    render(<SimulatedPhone />);
    await flush();
    expect(within(screen.getByRole("list", { name: /simulated thread/i })).getByText("JOIN")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /\/v#abc123/ });
    expect(link).toHaveAttribute("href", "/v#abc123");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("flags a thread message it cannot read instead of hiding it", async () => {
    stubFetch((url) =>
      url.startsWith("/api/messaging/simulated/thread") ? json({ ok: true, data: { messages: [{ weird: true }] } }) : undefined,
    );
    render(<SimulatedPhone />);
    await flush();
    expect(screen.getByText(/unreadable message/i)).toBeInTheDocument();
  });
});

describe("simulated phone link", () => {
  it("is linked from the dashboard only when messaging is fake", () => {
    const fake = fixtureSnapshot();
    render(<OperatorDashboard snapshot={fake} sourceLabel="x" />);
    expect(screen.getByRole("link", { name: /simulated phone/i })).toHaveAttribute("href", "/operator/phone");
    cleanup();
    const real = fixtureSnapshot();
    real.modes.messaging = { mode: "real", provider: "photon", channel: "imessage", status: "ok" };
    render(<OperatorDashboard snapshot={real} sourceLabel="x" />);
    expect(screen.queryByRole("link", { name: /simulated phone/i })).toBeNull();
  });
});
