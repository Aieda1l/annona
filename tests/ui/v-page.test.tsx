// T-UI-07 (page side): the donor checklist page /v. The link token travels in the URL fragment and is read by
// Dev 1's LinkVerification; this page must stay free of sessions, analytics and third-party scripts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/intake/components", () => ({
  LinkVerification: () => <div data-testid="link-verification" />,
}));

import VPage, { dynamic, metadata } from "@/app/v/page";

afterEach(cleanup);

const SOURCE = readFileSync(join(process.cwd(), "src/app/v/page.tsx"), "utf8");

describe("/v page", () => {
  it("is never cached, indexed or sent a referrer (metadata side of T-UI-07)", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(metadata.referrer).toBe("no-referrer");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("mounts Dev 1's LinkVerification and labels the page as a synthetic demo", () => {
    render(<VPage />);
    expect(screen.getByTestId("link-verification")).toBeInTheDocument();
    expect(screen.getByText(/synthetic demo/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("says the donor is the source of the facts, and claims nothing about safety", () => {
    const { container } = render(<VPage />);
    expect(container.textContent).toMatch(/you are the source/i);
    expect(container.textContent ?? "").not.toMatch(/\b(safe|safely|allergen[- ]free|certified|compliant|compliance)\b/i);
  });

  it("renders no script, iframe, external link or form of its own", () => {
    const { container } = render(<VPage />);
    expect(container.querySelector("script, iframe, form")).toBeNull();
    for (const a of container.querySelectorAll("a[href]")) expect(a.getAttribute("href")).toMatch(/^\//);
  });

  it("imports only the client-safe intake barrel (no server layers, no session, no analytics)", () => {
    const imports = [...SOURCE.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports).toContain("@/features/intake/components");
    for (const spec of imports) {
      expect(spec).not.toMatch(/^@\/(core|db|integrations|workflows|lib\/ai|server)/);
      expect(spec).not.toBe("@/features/intake");
    }
    expect(SOURCE).not.toMatch(/analytics|gtag|googletagmanager|segment|sentry|hotjar|plausible|cookies\(|getActor/i);
    expect(SOURCE).not.toMatch(/https?:\/\//i);
  });
});
