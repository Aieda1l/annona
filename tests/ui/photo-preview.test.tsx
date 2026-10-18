// A stored HEIC (iPhone photos arrive as HEIC from messaging, SP-14) cannot be decoded by most non-Safari browsers.
// The operator detail page must say so plainly and still offer the file, instead of a broken-image icon.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { eligibleCard } from "@/contracts";
import { DonationDetail } from "@/components/dashboard/DonationDetail";
import { PhotoPreview } from "@/components/dashboard/PhotoPreview";

afterEach(cleanup);

describe("PhotoPreview", () => {
  it("renders the image when it loads", () => {
    render(<PhotoPreview src="/api/images/abc" />);
    const img = screen.getByRole("img", { name: /donor photo/i });
    expect(img).toHaveAttribute("src", "/api/images/abc");
    expect(screen.queryByTestId("photo-fallback")).toBeNull();
  });

  it("on a load error shows a plain explanation and a link to the file, not a broken image", () => {
    render(<PhotoPreview src="/api/images/abc" />);
    fireEvent.error(screen.getByRole("img", { name: /donor photo/i }));
    expect(screen.queryByRole("img")).toBeNull();
    const fallback = screen.getByTestId("photo-fallback");
    expect(fallback).toHaveTextContent(/can.?t be previewed in this browser/i);
    expect(fallback).toHaveTextContent(/HEIC/i);
    const link = screen.getByRole("link", { name: /open the photo file/i });
    expect(link).toHaveAttribute("href", "/api/images/abc");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("the fallback claims nothing about the food", () => {
    render(<PhotoPreview src="/api/images/abc" />);
    fireEvent.error(screen.getByRole("img", { name: /donor photo/i }));
    expect(screen.getByTestId("photo-fallback").textContent ?? "").not.toMatch(/\b(safe|allergen[- ]free|certified|compliant)\b/i);
  });

  it("a new src resets the fallback so the next photo gets another chance", () => {
    const { rerender } = render(<PhotoPreview src="/api/images/abc" />);
    fireEvent.error(screen.getByRole("img", { name: /donor photo/i }));
    expect(screen.getByTestId("photo-fallback")).toBeInTheDocument();
    rerender(<PhotoPreview src="/api/images/def" />);
    expect(screen.getByRole("img", { name: /donor photo/i })).toHaveAttribute("src", "/api/images/def");
  });
});

describe("DonationDetail photo", () => {
  it("uses the fallback when the stored photo cannot be decoded", () => {
    render(
      <DonationDetail
        card={{ ...eligibleCard, image_url: "/api/images/abc" }}
        onAction={() => undefined}
        onHandoff={async () => ({ ok: true, summary: "x" })}
      />,
    );
    fireEvent.error(screen.getByRole("img", { name: /donor photo/i }));
    expect(screen.getByTestId("photo-fallback")).toBeInTheDocument();
  });

  it("still says 'No image on file' when there is no photo", () => {
    render(<DonationDetail card={eligibleCard} onAction={() => undefined} onHandoff={async () => ({ ok: true, summary: "x" })} />);
    expect(screen.getByText(/no image on file/i)).toBeInTheDocument();
    expect(screen.queryByTestId("photo-fallback")).toBeNull();
  });
});
