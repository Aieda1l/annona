// After a successful sign-in the picker must take the person to the page for their role (it used to stop at
// "Signed in as operator." with nothing to click). The server still decides who is signed in; this only navigates.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ProfilePicker } from "@/components/layout/ProfilePicker";

const ACTORS = [
  { role: "operator", actor_id: "00000000-0000-4000-8000-000000000001", display_name: "Operator (synthetic)" },
  { role: "donor", actor_id: "00000000-0000-4000-8000-000000000011", display_name: "Rainier Bakery (synthetic)" },
  { role: "courier", actor_id: "00000000-0000-4000-8000-000000000031", display_name: "Courier A (synthetic)" },
];

function mockServer(session: { ok: true; role: string } | { ok: false; status: number }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/session/actors") return Response.json({ ok: true, data: { actors: ACTORS } });
    if (url === "/api/session" && init?.method === "POST") {
      if (!session.ok) return Response.json({ ok: false, error: { code: "NOT_AUTHORIZED", message: "Please sign in." } }, { status: session.status });
      return Response.json({ ok: true, data: { actor: { role: session.role, id: "x" } } });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function signIn(actorId: string) {
  render(<ProfilePicker />);
  // Profiles are radio cards (UI redesign); pick the one whose value is the actor id.
  await screen.findByRole("radio", { name: /Operator/ });
  const radio = screen.getAllByRole("radio").find((r) => (r as HTMLInputElement).value === actorId)!;
  fireEvent.click(radio);
  fireEvent.change(screen.getByLabelText(/passcode/i), { target: { value: "pass" } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

beforeEach(() => push.mockReset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProfilePicker after sign-in", () => {
  it("sends an operator to /operator and offers the link too", async () => {
    mockServer({ ok: true, role: "operator" });
    await signIn(ACTORS[0]!.actor_id);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/operator"));
    expect(await screen.findByRole("status")).toHaveTextContent(/signed in as operator/i);
    expect(screen.getByRole("link", { name: /operator dashboard/i })).toHaveAttribute("href", "/operator");
  });

  it("sends a donor to /donor/new", async () => {
    mockServer({ ok: true, role: "donor" });
    await signIn(ACTORS[1]!.actor_id);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/donor/new"));
    expect(screen.getByRole("link", { name: /new donation/i })).toHaveAttribute("href", "/donor/new");
  });

  it("a courier has no web page: no navigation, and it says plainly why", async () => {
    mockServer({ ok: true, role: "courier" });
    await signIn(ACTORS[2]!.actor_id);
    expect(await screen.findByRole("status")).toHaveTextContent(/signed in as courier/i);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/by message/i);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("a refused sign-in shows the server's message and goes nowhere", async () => {
    mockServer({ ok: false, status: 403 });
    await signIn(ACTORS[0]!.actor_id);
    expect(await screen.findByRole("alert")).toHaveTextContent(/please sign in/i);
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("claims nothing about food safety", async () => {
    mockServer({ ok: true, role: "operator" });
    await signIn(ACTORS[0]!.actor_id);
    const status = await screen.findByRole("status");
    expect(status.textContent ?? "").not.toMatch(/\b(safe|allergen[- ]free|certified|compliant)\b/i);
  });
});
