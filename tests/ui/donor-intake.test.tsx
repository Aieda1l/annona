// /donor/new: the web upload fallback (same draft, checklist and gate as the messaging path).
// PhotoUpload -> DraftReview/VerificationForm (Dev 1) -> POST /api/donations/:id/verification -> donor status page.
// The donor page never triggers dispatch: the next scheduler tick does that (D-021).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftCardForTest } from "./helpers/draft-card";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// Dev 1's components are replaced by thin fakes that expose exactly the props this page must pass.
vi.mock("@/features/intake/components", () => ({
  PhotoUpload: (p: { onDraft: (c: unknown) => void }) => (
    <button type="button" onClick={() => p.onDraft(draftCardForTest)}>
      Pick photo
    </button>
  ),
  DraftReview: (p: {
    donationId: string;
    aiStatus: string;
    suggestion: unknown;
    onSubmit: (raw: unknown) => void | Promise<void>;
    submitting?: boolean;
    error?: string | null;
  }) => (
    <div data-testid="draft-review" data-donation-id={p.donationId} data-ai-status={p.aiStatus} data-has-suggestion={String(p.suggestion !== null)}>
      <button type="button" disabled={p.submitting} onClick={() => void p.onSubmit({ dish_name: "Test dish" })}>
        Submit facts
      </button>
      {p.error ? <p role="alert">{p.error}</p> : null}
    </div>
  ),
}));

import { DonorIntake } from "@/components/donor/DonorIntake";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => push.mockReset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pickPhoto = () => fireEvent.click(screen.getByRole("button", { name: /pick photo/i }));

describe("DonorIntake", () => {
  it("starts with the uploader, labeled as the web fallback, and no checklist yet", () => {
    render(<DonorIntake />);
    expect(screen.getByRole("button", { name: /pick photo/i })).toBeInTheDocument();
    expect(screen.queryByTestId("draft-review")).toBeNull();
    expect(screen.getByText(/web upload/i)).toBeInTheDocument();
    expect(screen.getByText(/synthetic demo/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/");
  });

  it("after the draft is created, shows the checklist keyed by that donation with the server's AI status", () => {
    render(<DonorIntake />);
    pickPhoto();
    const review = screen.getByTestId("draft-review");
    expect(review).toHaveAttribute("data-donation-id", draftCardForTest.id);
    expect(review).toHaveAttribute("data-ai-status", draftCardForTest.ai_status);
    expect(review).toHaveAttribute("data-has-suggestion", String(draftCardForTest.ai_suggestion !== null));
  });

  it("posts the raw facts to the verification route, then goes to the donor status page", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return json({ ok: true, data: draftCardForTest });
      }),
    );
    render(<DonorIntake />);
    pickPhoto();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit facts/i }));
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`/api/donations/${draftCardForTest.id}/verification`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ dish_name: "Test dish" });
    expect(push).toHaveBeenCalledWith(`/donor/donations/${draftCardForTest.id}`);
  });

  it("never calls dispatch or the tick route", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        urls.push(url);
        return json({ ok: true, data: draftCardForTest });
      }),
    );
    render(<DonorIntake />);
    pickPhoto();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit facts/i }));
    });
    expect(urls.some((u) => /dispatch|internal\/tick/.test(u))).toBe(false);
  });

  it("shows a server refusal verbatim, stays on the checklist and lets the donor retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Servings must be a whole number.", retryable: false } }, 400)),
    );
    render(<DonorIntake />);
    pickPhoto();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit facts/i }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("VALIDATION_FAILED: Servings must be a whole number.");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /submit facts/i })).toBeEnabled();
  });

  it("reports an unreachable server instead of pretending success", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
    render(<DonorIntake />);
    pickPhoto();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit facts/i }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("UNREACHABLE");
    expect(push).not.toHaveBeenCalled();
  });

  it("cannot be submitted twice while a request is in flight", async () => {
    let release!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (release = r)));
    vi.stubGlobal("fetch", fetchMock);
    render(<DonorIntake />);
    pickPhoto();
    const btn = screen.getByRole("button", { name: /submit facts/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => release(new Response(JSON.stringify({ ok: true, data: draftCardForTest }), { status: 200 })));
  });
});
