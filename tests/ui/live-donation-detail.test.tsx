// Operator detail, live: polls GET /api/donations/:id, posts handoff and operator actions, never fabricates a card.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimedCard, eligibleCard } from "@/contracts";
import { LiveDonationDetail } from "@/components/dashboard/LiveDonationDetail";
import { OperatorDashboard } from "@/components/dashboard/OperatorDashboard";
import { fixtureSnapshot } from "@/components/dashboard/fixture-snapshot";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", date: "Sat, 17 Oct 2026 23:00:00 GMT" },
    }));
const err = (code: string, message: string) => ({ ok: false, error: { code, message, retryable: false } });
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

const ID = claimedCard.id;

describe("LiveDonationDetail", () => {
  it("polls GET /api/donations/:id every 2 s and renders the card", async () => {
    const fetchMock = vi.fn((..._a: unknown[]) => json({ ok: true, data: claimedCard }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDonationDetail id={ID} />);
    await flush();
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/donations/${ID}`);
    expect(screen.getByTestId("status-badge")).toHaveAttribute("data-status", "claimed");
    await flush(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows NOT_FOUND and invents no card for an unknown id", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(err("NOT_FOUND", "Donation not found."), 404)));
    render(<LiveDonationDetail id={ID} />);
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("NOT_FOUND");
    expect(screen.queryByTestId("donation-card")).toBeNull();
  });

  it("keeps the last card labeled stale after a failure and recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json({ ok: true, data: claimedCard }))
      .mockImplementationOnce(() => json(err("PROVIDER_UNAVAILABLE", "store down"), 502))
      .mockImplementation(() => json({ ok: true, data: claimedCard }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDonationDetail id={ID} />);
    await flush();
    await flush(2000);
    expect(screen.getByRole("alert")).toHaveTextContent("PROVIDER_UNAVAILABLE");
    expect(screen.getByText(/stale since Oct 17.*PDT/i)).toBeInTheDocument();
    expect(screen.getByTestId("donation-card")).toBeInTheDocument();
    await flush(2000);
    expect(screen.queryByText(/stale since/i)).toBeNull();
  });

  it("does not poll while the tab is hidden", async () => {
    const fetchMock = vi.fn((..._a: unknown[]) => json({ ok: true, data: claimedCard }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDonationDetail id={ID} />);
    await flush();
    hidden = true;
    await flush(6000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Mark collected posts { step } to the handoff route and refreshes", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith("/handoff")) return json({ ok: true, data: { ...claimedCard, status: "collected" } });
        return json({ ok: true, data: claimedCard });
      }),
    );
    render(<LiveDonationDetail id={ID} />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /mark collected/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
    const post = calls.find((c) => c.url === `/api/donations/${ID}/handoff`)!;
    expect(post.init?.method).toBe("POST");
    expect(JSON.parse(post.init!.body as string)).toEqual({ step: "collected" });
    expect(calls.filter((c) => c.url === `/api/donations/${ID}`).length).toBeGreaterThanOrEqual(2);
  });

  it("shows a refused handoff exactly as the server said it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("/handoff")
          ? json(err("INVALID_TRANSITION", "The effective cutoff has been reached."), 409)
          : json({ ok: true, data: claimedCard }),
      ),
    );
    render(<LiveDonationDetail id={ID} />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /mark collected/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("INVALID_TRANSITION: The effective cutoff has been reached.");
  });

  it("operator action posts { action, note } and shows a refusal verbatim", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith("/operator-actions")) return json(err("INVALID_TRANSITION", "A note is required."), 409);
        return json({ ok: true, data: eligibleCard });
      }),
    );
    render(<LiveDonationDetail id={eligibleCard.id} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /^cancel/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm cancel/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
    const post = calls.find((c) => c.url.endsWith("/operator-actions"))!;
    expect(JSON.parse(post.init!.body as string)).toEqual({ action: "cancel", note: "" });
    expect(screen.getByRole("alert")).toHaveTextContent("INVALID_TRANSITION: A note is required.");
  });
});

describe("dashboard links to the detail page", () => {
  it("each card title links to /operator/donations/:id", () => {
    render(<OperatorDashboard snapshot={fixtureSnapshot()} sourceLabel="x" />);
    // Several fixture cards share a dish name, so pick the link by its target.
    const links = screen.getAllByRole("link", { name: eligibleCard.verified_facts!.dish_name });
    expect(links.map((l) => l.getAttribute("href"))).toContain(`/operator/donations/${eligibleCard.id}`);
    expect(links.every((l) => l.getAttribute("href")?.startsWith("/operator/donations/"))).toBe(true);
  });
});

describe("LiveDonationDetail id encoding", () => {
  it("encodes the route id so it cannot reach another API path", async () => {
    const raw = "x/../../other?y=1";
    const fetchMock = vi.fn((..._a: unknown[]) => json({ ok: true, data: claimedCard }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDonationDetail id={raw} />);
    await flush();
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/donations/${encodeURIComponent(raw)}`);
    fireEvent.click(screen.getByRole("button", { name: /Mark collected/ }));
    await flush();
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe(`/api/donations/${encodeURIComponent(raw)}/handoff`);
  });
});
