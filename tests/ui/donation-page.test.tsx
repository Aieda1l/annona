// The server page must hand only serializable data to client components (a function prop returned 500 in `next dev`).
import { isValidElement, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { claimedCard } from "@/contracts";
import OperatorDonationPage from "@/app/operator/donations/[id]/page";

const page = (id: string, fixture?: string) =>
  OperatorDonationPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ fixture }) });

describe("operator donation page", () => {
  it("live route passes only the id", async () => {
    const el = (await page(claimedCard.id)) as ReactElement<Record<string, unknown>>;
    expect(isValidElement(el)).toBe(true);
    expect(el.props).toEqual({ id: claimedCard.id });
  });

  it("fixture route passes only plain card data, no functions", async () => {
    const el = (await page(claimedCard.id, "1")) as ReactElement<Record<string, unknown>>;
    expect(Object.keys(el.props)).toEqual(["card"]);
    expect(Object.values(el.props).some((v) => typeof v === "function")).toBe(false);
    expect(() => JSON.stringify(el.props)).not.toThrow();
  });

  it("unknown fixture id says so and renders no card", async () => {
    const el = (await page("does-not-exist", "1")) as ReactElement;
    render(el);
    expect(screen.getByRole("alert")).toHaveTextContent(/no fixture card has that id/);
    expect(screen.queryByTestId("donation-card")).toBeNull();
  });
});
