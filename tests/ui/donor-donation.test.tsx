// /donor/donations/[id]: what the donor sees about their own donation. Renders the server's donor projection
// exactly; shows offers only as status, sent and expiry times; never calls dispatch; no operator controls.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimedCard,
  DONATION_CARD_FIXTURES,
  DONATION_STATUSES,
  eligibleCard,
  needsReviewCard,
  type DonationCard,
  type DonationStatus,
} from "@/contracts";
import { DonorDonationView } from "@/components/donor/DonorDonationView";
import { LiveDonorDonation } from "@/components/donor/LiveDonorDonation";

const cardFor = (status: DonationStatus): DonationCard =>
  DONATION_CARD_FIXTURES.find((c) => c.status === status) ?? {
    ...(status === "collected" || status === "delivered" ? claimedCard : eligibleCard),
    status,
    ...(status === "draft" ? { verified_facts: null, decision: null, effective_cutoff_at: null } : {}),
    ...(status === "offered" ? { active_offers: [{ ...claimedCard.active_offers[0]!, status: "open" as const, responded_at: null }] } : {}),
    handoff: {
      collected_at: status === "collected" || status === "delivered" ? "2026-10-17T23:25:00.000Z" : null,
      delivered_at: status === "delivered" ? "2026-10-17T23:40:00.000Z" : null,
      simulated: true,
    },
  };

const FORBIDDEN = /\b(safe|safely|allergen[- ]free|certified|compliant|compliance)\b/i;

afterEach(cleanup);

describe("DonorDonationView", () => {
  it.each(DONATION_STATUSES)("renders %s with a plain-language status, no operator controls and no safety wording", (status) => {
    const { container } = render(<DonorDonationView card={cardFor(status)} />);
    expect(screen.getByTestId("status-badge")).toHaveAttribute("data-status", status);
    expect(screen.getByTestId("donor-status-explainer").textContent!.length).toBeGreaterThan(10);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  it("shows the gate's reasons verbatim", () => {
    render(<DonorDonationView card={needsReviewCard} />);
    for (const r of needsReviewCard.decision!.reasons) expect(screen.getByText(r.message)).toBeInTheDocument();
  });

  it("lists what is still missing from field states that are unknown or need review", () => {
    render(<DonorDonationView card={needsReviewCard} />);
    const missing = screen.getByRole("list", { name: /still missing/i });
    expect(missing).toHaveTextContent(/continuous cold holding/i);
    expect(missing).toHaveTextContent(/sesame/i);
    expect(missing).not.toHaveTextContent(/dish name/i); // donor_verified fields are not missing
  });

  it("an eligible donation says it waits for the next scheduler run and offers no dispatch control", () => {
    render(<DonorDonationView card={eligibleCard} />);
    expect(screen.getByTestId("donor-status-explainer")).toHaveTextContent(/next scheduler run/i);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/dispatch now/i)).toBeNull();
  });

  it("an unmatched donation reads as a courier shortage, not a safety finding", () => {
    render(<DonorDonationView card={cardFor("unmatched")} />);
    expect(screen.getByTestId("donor-status-explainer")).toHaveTextContent(/courier|recipient/i);
    expect(screen.getByTestId("donor-status-explainer").textContent).not.toMatch(/review|reject|unsafe/i);
  });

  it("shows offers only as status, sent and expiry times: no courier, recipient, code or provider id", () => {
    const offered = cardFor("offered");
    const offer = offered.active_offers[0]!;
    const { container } = render(<DonorDonationView card={offered} />);
    const offers = screen.getByRole("list", { name: /offers/i });
    expect(offers).toHaveTextContent(/open/i);
    const text = container.textContent ?? "";
    expect(text).not.toContain(offer.courier_display_name);
    expect(text).not.toContain(offer.recipient_display_name);
    expect(text).not.toContain(offer.short_code);
    expect(text).not.toContain(offer.provider_message_id ?? "no-id");
  });

  it("after a claim, shows the assignment exactly as the server returned it, and the handoff as simulated", () => {
    render(<DonorDonationView card={claimedCard} />);
    expect(screen.getByTestId("donor-assignment")).toHaveTextContent(claimedCard.assignment!.courier_display_name);
    expect(screen.getByTestId("donor-assignment")).toHaveTextContent(/simulated/i);
  });

  it("collected and delivered are labeled simulated", () => {
    for (const s of ["collected", "delivered"] as const) {
      const { container } = render(<DonorDonationView card={cardFor(s)} />);
      expect(container.textContent).toMatch(/simulated/i);
      cleanup();
    }
  });

  it("shows the donor's own dish name and never an operator-only field", () => {
    const { container } = render(<DonorDonationView card={eligibleCard} />);
    expect(container.textContent).toContain(eligibleCard.verified_facts!.dish_name);
    expect(container.textContent).not.toMatch(/audit|policy|provider/i);
  });
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", date: "Sat, 17 Oct 2026 23:00:00 GMT" } }));
const err = (code: string, message: string) => ({ ok: false, error: { code, message, retryable: false } });
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("LiveDonorDonation", () => {
  let hidden = false;
  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls GET /api/donations/:id and renders the donor view", async () => {
    const fetchMock = vi.fn((..._a: unknown[]) => json({ ok: true, data: eligibleCard }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDonorDonation id={eligibleCard.id} />);
    await flush();
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/donations/${eligibleCard.id}`);
    expect(screen.getByTestId("status-badge")).toHaveAttribute("data-status", "eligible");
    await flush(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("only ever requests the donation route (never an operator, dashboard or dispatch route)", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        urls.push(url);
        return json({ ok: true, data: eligibleCard });
      }),
    );
    render(<LiveDonorDonation id={eligibleCard.id} />);
    await flush(4000);
    expect(new Set(urls)).toEqual(new Set([`/api/donations/${eligibleCard.id}`]));
  });

  it("NOT_AUTHORIZED tells the donor to sign in and shows no card", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(err("NOT_AUTHORIZED", "Not authorized."), 403)));
    render(<LiveDonorDonation id={eligibleCard.id} />);
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(/sign in/i);
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/");
    expect(screen.queryByTestId("status-badge")).toBeNull();
  });

  it("NOT_FOUND shows the code and invents no donation", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(err("NOT_FOUND", "Donation not found."), 404)));
    render(<LiveDonorDonation id="nope" />);
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("NOT_FOUND");
    expect(screen.queryByTestId("status-badge")).toBeNull();
  });

  it("keeps the last view labeled stale after a failure, then recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json({ ok: true, data: eligibleCard }))
      .mockImplementationOnce(() => json(err("PROVIDER_UNAVAILABLE", "store down"), 502))
      .mockImplementation(() => json({ ok: true, data: eligibleCard }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDonorDonation id={eligibleCard.id} />);
    await flush();
    await flush(2000);
    expect(screen.getByRole("alert")).toHaveTextContent("PROVIDER_UNAVAILABLE");
    expect(screen.getByText(/stale since Oct 17.*PDT/i)).toBeInTheDocument();
    expect(screen.getByTestId("status-badge")).toBeInTheDocument();
    await flush(2000);
    expect(screen.queryByText(/stale/i)).toBeNull();
  });

  it("does not poll while the tab is hidden", async () => {
    const fetchMock = vi.fn((..._a: unknown[]) => json({ ok: true, data: eligibleCard }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDonorDonation id={eligibleCard.id} />);
    await flush();
    hidden = true;
    await flush(6000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
