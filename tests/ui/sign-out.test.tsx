// A Sign out button on every page except the home page (where the profile picker is). It asks the server to clear the
// session cookie (DELETE /api/session) and only then goes home; it never claims to be signed out if the server says no.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let pathname = "/operator";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: () => undefined }), usePathname: () => pathname }));

import { SignOutButton } from "@/components/layout/SignOutButton";

beforeEach(() => {
  push.mockReset();
  pathname = "/operator";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SignOutButton", () => {
  it("clears the session on the server, then goes to the home page", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, data: { cleared: true } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.objectContaining({ method: "DELETE" }));
  });

  it("shows a plain error and stays put if the server does not clear the session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error: { code: "INTERNAL", message: "boom" } }, { status: 500 })));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not sign out/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the same error if the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("network"))));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not sign out/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("is disabled while the request is in flight, so a double click sends one request", async () => {
    let release: (r: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (release = r)));
    vi.stubGlobal("fetch", fetchMock);
    render(<SignOutButton />);
    const button = screen.getByRole("button", { name: /sign out/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    release(Response.json({ ok: true, data: { cleared: true } }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("is usable again after signing out and signing back in (the layout keeps the component mounted)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { cleared: true } })));
    const { rerender } = render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    pathname = "/";
    rerender(<SignOutButton />);
    pathname = "/donor/new";
    rerender(<SignOutButton />);
    expect(screen.getByRole("button", { name: /sign out/i })).toBeEnabled();
  });

  it("is usable again when the user signs back in and lands on the same page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { cleared: true } })));
    const { rerender } = render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    pathname = "/";
    rerender(<SignOutButton />);
    pathname = "/operator";
    rerender(<SignOutButton />);
    expect(screen.getByRole("button", { name: /sign out/i })).toBeEnabled();
  });

  it("is not shown on the home page, where the profile picker is", () => {
    pathname = "/";
    render(<SignOutButton />);
    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
  });

  it("is shown on the donor and operator pages", () => {
    for (const p of ["/operator", "/operator/phone", "/donor/new", "/operator/donations/abc"]) {
      pathname = p;
      const { unmount } = render(<SignOutButton />);
      expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
      unmount();
    }
  });
});
