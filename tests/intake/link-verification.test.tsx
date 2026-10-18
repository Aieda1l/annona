import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eligibleCard, needsReviewCard, scene1_eligible_facts, scene1_vision_suggestion, type VerificationLinkView } from "@/contracts";
import { LinkVerification } from "@/features/intake/components";

// T-IN-13 (UI): the /v page component. The token lives in the URL fragment and travels only in POST bodies.
afterEach(cleanup);

const TOKEN = "T0kEn-abcdefghijklmnopqrstuvwxyz0123456789_";
const NEW_TOKEN = "NeWtOkEn-abcdefghijklmnopqrstuvwxyz012345";
const UNIFORM = "This link has expired or was already used. Text the photo again for a new link.";
const FORBIDDEN = /\b(safe|safely|allergen[- ]free|certified|compliant|compliance)\b/i;

const view = (over: Partial<VerificationLinkView> = {}): VerificationLinkView => ({
  donation_id: "00000000-0000-4000-8000-0000000000aa",
  donor_display_name: "Rainier Catering (synthetic)",
  status: "draft",
  ai_status: "succeeded",
  ai_suggestion: scene1_vision_suggestion,
  verified_facts: null,
  decision: null,
  link_expires_at: "2026-10-17T23:40:00.000Z",
  resubmit_token: null,
  is_synthetic: true,
  ...over,
});
const eligibleView = view({ status: "eligible", verified_facts: scene1_eligible_facts, decision: eligibleCard.decision });
const reviewView = (resubmit_token: string | null) =>
  view({ status: "needs_review", decision: needsReviewCard.decision, resubmit_token });

type Route = (body: Record<string, unknown>) => Response | Promise<Response>;
function api(routes: { view?: Route; image?: Route; submit?: Route } = {}) {
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const name = url.replace("/api/verify/", "") as "view" | "image" | "submit";
    const route =
      routes[name] ??
      (name === "view"
        ? () => Response.json({ ok: true, data: view() })
        : name === "image"
          ? // Bytes, not a jsdom Blob: Node's Response only treats its own Blob class as a Blob, and what it does with a foreign one varies by Node version.
            () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })
          : () => Response.json({ ok: true, data: eligibleView }));
    return route(body);
  });
  return fetchImpl;
}
const forbidden = () => Response.json({ ok: false, error: { code: "NOT_AUTHORIZED", message: UNIFORM, retryable: false } }, { status: 403 });

function renderLink(fetchImpl = api(), hash = `#${TOKEN}`) {
  const utils = render(<LinkVerification hash={hash} fetchImpl={fetchImpl as unknown as typeof fetch} />);
  return { fetchImpl, ...utils };
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/^Dish name/i), { target: { value: "Sandwich tray" } });
  fireEvent.change(screen.getByLabelText(/^Servings/i), { target: { value: "24" } });
  fireEvent.change(screen.getByLabelText(/Latest time you can hand/i), { target: { value: "2026-10-18T10:00" } });
  fireEvent.click(screen.getByLabelText(/no discard-by time/i));
  fireEvent.change(screen.getByLabelText(/Your name or role/i), { target: { value: "Catering lead" } });
  fireEvent.click(screen.getByLabelText(/I attest/i));
  // D-042: the AI draft fills the ingredients list, which the donor must say they checked.
  const checked = screen.queryByLabelText(/checked this ingredient list/i);
  if (checked) fireEvent.click(checked);
  fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:test-image");
  URL.revokeObjectURL = vi.fn();
});

describe("loading and token handling", () => {
  it("reads the token from the fragment and sends it only in POST bodies, never in a URL", async () => {
    const { fetchImpl } = renderLink();
    await screen.findByLabelText(/^Dish name/i);
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map((c) => c[0]).sort()).toEqual(["/api/verify/image", "/api/verify/view"]);
    for (const [url, init] of calls) {
      expect(init.method).toBe("POST");
      expect(url).not.toContain(TOKEN);
      expect(url).not.toContain("?");
      expect(JSON.parse(String(init.body))).toEqual({ token: TOKEN });
    }
  });

  it("never renders the token", async () => {
    const { container } = renderLink();
    await screen.findByLabelText(/^Dish name/i);
    expect(container.innerHTML).not.toContain(TOKEN);
  });

  it("reads window.location.hash when no hash prop is given", async () => {
    window.location.hash = `#${TOKEN}`;
    const fetchImpl = api();
    render(<LinkVerification fetchImpl={fetchImpl as unknown as typeof fetch} />);
    await screen.findByLabelText(/^Dish name/i);
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ token: TOKEN });
    window.location.hash = "";
  });

  it.each(["", "#"])("a missing token (%j) shows a message and makes no request", async (hash) => {
    const { fetchImpl } = renderLink(api(), hash);
    expect(await screen.findByText(/needs the link we texted you/i)).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/^Dish name/i)).toBeNull();
  });

  it("shows the photo from the image endpoint as an object URL, and revokes it on unmount", async () => {
    const { unmount } = renderLink();
    expect(await screen.findByRole("img", { name: /photo you submitted/i })).toHaveAttribute("src", "blob:test-image");
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-image");
  });

  it("still shows the form when the photo cannot be loaded", async () => {
    renderLink(api({ image: () => forbidden() }));
    expect(await screen.findByLabelText(/^Dish name/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("the same form as the web path (T-IN-12 defaults hold)", () => {
  it("renders the AI panel and a form with every allergen and handling answer starting at unknown", async () => {
    renderLink();
    await screen.findByLabelText(/^Dish name/i);
    expect(screen.getByText("AI: FAKE")).toBeInTheDocument();
    // D-042: the draft fills the dish name, the lower servings bound and the allergens the AI flagged (as Present);
    // an allergen it did not mention stays unknown, and no safety fact is touched.
    for (const [name, value] of [["Milk", "present"], ["Wheat", "present"], ["Sesame", "unknown"]] as const) {
      const group = screen.getByRole("group", { name });
      expect(within(group).getByRole("radio", { checked: true })).toHaveAttribute("value", value);
    }
    expect(screen.getByLabelText(/How is this food being held right now/i)).toHaveValue("unknown");
    expect(screen.getByLabelText(/^Servings/i)).toHaveValue(18);
    expect(screen.getByLabelText(/^Dish name/i)).toHaveValue("assorted deli sandwiches and wraps");
  });

  it("fails closed when the AI draft failed: no AI panel, form fully usable", async () => {
    renderLink(api({ view: () => Response.json({ ok: true, data: view({ ai_status: "failed", ai_suggestion: null }) }) }));
    await screen.findByLabelText(/^Dish name/i);
    expect(screen.queryByTestId("ai-panel")).toBeNull();
    expect(screen.getByLabelText(/^Dish name/i)).toBeEnabled();
  });
});

describe("an invalid, expired or used link", () => {
  it("shows the uniform message and no form, and does not ask for the photo", async () => {
    const { fetchImpl } = renderLink(api({ view: () => forbidden() }));
    expect(await screen.findByText(UNIFORM)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Dish name/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
    expect((fetchImpl.mock.calls as unknown as [string][]).some((c) => c[0].endsWith("/image"))).toBe(false);
  });

  it("a server failure shows a generic retry message, not the uniform expiry", async () => {
    renderLink(api({ view: () => new Response("oops", { status: 500 }) }));
    expect(await screen.findByText(/something went wrong loading this page/i)).toBeInTheDocument();
    expect(screen.queryByText(UNIFORM)).toBeNull();
  });
});

describe("submitting", () => {
  it("posts { token, facts } and, when eligible, shows a thank-you and no form", async () => {
    const { fetchImpl } = renderLink();
    await screen.findByLabelText(/^Dish name/i);
    fillAndSubmit();
    expect(await screen.findByTestId("link-outcome")).toHaveTextContent(/thank you/i);
    const submit = (fetchImpl.mock.calls as unknown as [string, RequestInit][]).find((c) => c[0] === "/api/verify/submit")!;
    const sent = JSON.parse(String(submit[1].body));
    expect(Object.keys(sent).sort()).toEqual(["facts", "token"]);
    expect(sent.token).toBe(TOKEN);
    expect(sent.facts).toMatchObject({ dish_name: "Sandwich tray", servings: 24 });
    expect(screen.queryByLabelText(/^Dish name/i)).toBeNull();
  });

  it("on needs_review shows the reasons and the form again, and the next submit uses the new token", async () => {
    const submit = vi
      .fn<Route>()
      .mockResolvedValueOnce(Response.json({ ok: true, data: reviewView(NEW_TOKEN) }))
      .mockResolvedValueOnce(Response.json({ ok: true, data: eligibleView }));
    const { fetchImpl } = renderLink(api({ submit }));
    await screen.findByLabelText(/^Dish name/i);
    fillAndSubmit();
    const reasons = await screen.findByLabelText("Decision reasons");
    expect(reasons).toHaveTextContent(/cooling history|cold holding/i);
    expect(screen.getByLabelText(/^Dish name/i)).toHaveValue("Sandwich tray"); // what the donor typed is kept
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    await screen.findByTestId("link-outcome");
    expect(submit.mock.calls[0]![0]).toMatchObject({ token: TOKEN });
    expect(submit.mock.calls[1]![0]).toMatchObject({ token: NEW_TOKEN });
    for (const [url] of fetchImpl.mock.calls as unknown as [string][]) expect(url).not.toContain(NEW_TOKEN);
  });

  it("on rejected shows the reasons and no form", async () => {
    renderLink(api({ submit: () => Response.json({ ok: true, data: view({ status: "rejected", decision: needsReviewCard.decision }) }) }));
    await screen.findByLabelText(/^Dish name/i);
    fillAndSubmit();
    expect(await screen.findByLabelText("Decision reasons")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Dish name/i)).toBeNull();
  });

  it("a 400 shows the server's message, keeps the form and keeps the same token", async () => {
    const submit = vi
      .fn<Route>()
      .mockResolvedValueOnce(Response.json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Request body is not valid.", retryable: false } }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ ok: true, data: eligibleView }));
    renderLink(api({ submit }));
    await screen.findByLabelText(/^Dish name/i);
    fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/not valid/i);
    expect(screen.getByLabelText(/^Dish name/i)).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    await screen.findByTestId("link-outcome");
    expect(submit.mock.calls[1]![0]).toMatchObject({ token: TOKEN });
  });

  it("a 403 on submit shows the uniform message and no form", async () => {
    renderLink(api({ submit: () => forbidden() }));
    await screen.findByLabelText(/^Dish name/i);
    fillAndSubmit();
    expect(await screen.findByText(UNIFORM)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Dish name/i)).toBeNull();
  });

  it("a network failure on submit shows an error and leaves the form usable", async () => {
    renderLink(api({ submit: () => Promise.reject(new TypeError("offline")) }));
    await screen.findByLabelText(/^Dish name/i);
    fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
    await waitFor(() => expect(screen.getByRole("button", { name: /submit for review/i })).toBeEnabled());
  });
});

describe("wording", () => {
  it("never renders forbidden wording in any state", async () => {
    const states: Array<[string, ReturnType<typeof api>]> = [
      ["ready", api()],
      ["expired", api({ view: () => forbidden() })],
      ["review", api({ submit: () => Response.json({ ok: true, data: reviewView(NEW_TOKEN) }) })],
    ];
    for (const [, f] of states) {
      const { container } = renderLink(f);
      await waitFor(() => expect(container.textContent).not.toMatch(/Loading/));
      if (screen.queryByLabelText(/^Dish name/i)) {
        fillAndSubmit();
        await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(2));
      }
      expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
      cleanup();
    }
  });
});
