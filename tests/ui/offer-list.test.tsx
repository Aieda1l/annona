import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { claimedCard } from "@/contracts";
import { OfferList } from "@/components/dashboard/OfferList";
import { formatPacific } from "@/components/dashboard/format";

afterEach(cleanup);

describe("formatPacific", () => {
  it("renders America/Los_Angeles with the zone shown", () => {
    expect(formatPacific("2026-10-17T23:12:00.000Z")).toMatch(/4:12\s?PM PDT/);
  });
  it("renders a dash for null", () => {
    expect(formatPacific(null)).toBe("—");
  });
});

describe("OfferList", () => {
  it("labels provider mode, delivery status and short code", () => {
    render(<OfferList offers={claimedCard.active_offers} />);
    const row = screen.getByTestId("offer-00000000-0000-4000-8000-0000000000a1");
    expect(row).toHaveTextContent("K7M3");
    expect(row).toHaveTextContent(/simulated/i);
    expect(row).toHaveTextContent(/accepted/i);
  });
  it("renders nothing for no offers", () => {
    const { container } = render(<OfferList offers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
