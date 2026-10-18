import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scene1_vision_suggestion, type VisionSuggestion } from "@/contracts";
import { DraftReview } from "@/features/intake/components";

afterEach(cleanup);

const FORBIDDEN = /\b(safe|safely|safety-approved|allergen[- ]free|certified|compliant|compliance)\b/i;
const real: VisionSuggestion = { ...scene1_vision_suggestion, provider: "gemini", mode: "real", model: "gemini-3.5-flash-lite" };

const renderReview = (props: Partial<React.ComponentProps<typeof DraftReview>> = {}) => {
  const onSubmit = vi.fn();
  const utils = render(
    <DraftReview donationId="don_1" aiStatus="succeeded" suggestion={scene1_vision_suggestion} onSubmit={onSubmit} {...props} />,
  );
  return { onSubmit, ...utils };
};

describe("AI suggestion succeeded", () => {
  it("labels fake mode and marks every AI field as suggested", () => {
    renderReview();
    expect(screen.getByText("AI: FAKE")).toBeInTheDocument();
    expect(screen.getByTestId("field-state-dish_name")).toHaveAttribute("data-state", "suggested");
    expect(screen.getByTestId("field-state-servings")).toHaveAttribute("data-state", "suggested");
    expect(screen.getByTestId("field-state-allergens")).toHaveAttribute("data-state", "suggested");
  });

  it("shows the model for real mode and no FAKE label", () => {
    renderReview({ suggestion: real });
    expect(screen.queryByText("AI: FAKE")).toBeNull();
    expect(screen.getByText(/AI: gemini-3\.5-flash-lite/)).toBeInTheDocument();
  });

  it("describes the AI as unverified and says what it cannot see", () => {
    renderReview();
    expect(screen.getByTestId("ai-disclaimer")).toHaveTextContent(/cannot see ingredients, allergens, temperatures or handling/i);
    expect(screen.getByTestId("ai-disclaimer")).toHaveTextContent(/you confirm every fact/i);
  });

  it("lists possible allergens as possible, plus the AI's uncertainty notes and questions", () => {
    renderReview();
    const panel = screen.getByTestId("ai-panel");
    expect(panel).toHaveTextContent(/possible/i);
    for (const a of ["wheat", "milk", "eggs"]) expect(panel).toHaveTextContent(new RegExp(a, "i"));
    expect(panel).toHaveTextContent(/Fillings and spreads cannot be identified from a photo/);
    expect(panel).toHaveTextContent(/Which spreads and fillings are used/);
  });

  it("warns when the photo is hard to read", () => {
    renderReview({ suggestion: { ...scene1_vision_suggestion, image_quality: "poor" } });
    expect(screen.getByRole("status")).toHaveTextContent(/hard to read/i);
  });

  it("warns when the photo does not look like food", () => {
    renderReview({ suggestion: { ...scene1_vision_suggestion, image_quality: "not_food" } });
    expect(screen.getByRole("status")).toHaveTextContent(/does not look like food/i);
  });

  it("fills only the descriptive fields from the suggestion (D-042) and never selects 'not in my listed ingredients'", () => {
    renderReview();
    expect(screen.getByLabelText(/^Dish name/i)).not.toHaveValue(""); // the AI's top dish name, tagged and editable
    const milk = screen.getByRole("group", { name: "Milk" });
    expect(within(milk).getByRole("radio", { checked: true })).toHaveAttribute("value", "present"); // flagged by the AI: cautious direction
    const sesame = screen.getByRole("group", { name: "Sesame" });
    expect(within(sesame).getByRole("radio", { checked: true })).toHaveAttribute("value", "unknown"); // not flagged: stays unknown
    expect(screen.queryAllByRole("radio", { checked: true }).filter((r) => r.getAttribute("value") === "not_in_listed_ingredients")).toHaveLength(0);
  });

  it("renders no forbidden wording", () => {
    const { container } = renderReview();
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });
});

describe("AI draft unavailable", () => {
  it.each(["failed", "skipped"] as const)("%s: explains it and keeps the manual form usable", (aiStatus) => {
    const { onSubmit } = renderReview({ aiStatus, suggestion: null });
    expect(screen.getByRole("status")).toHaveTextContent(/could not be analyzed|not available/i);
    expect(screen.queryByTestId("ai-panel")).toBeNull();
    expect(screen.queryByText("AI: FAKE")).toBeNull();
    expect(screen.queryByTestId("ai-hint-servings")).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Dish name/i), { target: { value: "Soup" } });
    fireEvent.change(screen.getByLabelText(/^Servings/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/Latest time you can hand/i), { target: { value: "2026-10-17T18:30" } });
    fireEvent.click(screen.getByLabelText(/no discard-by time/i));
    fireEvent.change(screen.getByLabelText(/Your name or role/i), { target: { value: "Cook" } });
    fireEvent.click(screen.getByLabelText(/I attest/i));
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("pending: says the draft is still being prepared and the form is usable", () => {
    renderReview({ aiStatus: "pending", suggestion: null });
    expect(screen.getByRole("status")).toHaveTextContent(/still being prepared/i);
    expect(screen.getByLabelText(/^Dish name/i)).toBeEnabled();
  });

  it("ignores a suggestion when the status is failed (fail closed)", () => {
    renderReview({ aiStatus: "failed", suggestion: scene1_vision_suggestion });
    expect(screen.queryByTestId("ai-panel")).toBeNull();
    expect(screen.queryByTestId("ai-hint-servings")).toBeNull();
  });
});

describe("photo and form wiring", () => {
  it("shows the photo only when an image URL is given", () => {
    renderReview();
    expect(screen.queryByRole("img")).toBeNull();
    cleanup();
    renderReview({ imageUrl: "/api/images/abc" });
    expect(screen.getByRole("img", { name: /photo you submitted/i })).toHaveAttribute("src", "/api/images/abc");
  });

  it("passes submitting and error through to the form", () => {
    renderReview({ submitting: true, error: "Please try again." });
    expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/please try again/i);
  });
});

describe("switching donations", () => {
  it("does not carry typed values or the attestation over to a different donation", () => {
    const onSubmit = vi.fn();
    const props = { aiStatus: "succeeded" as const, suggestion: scene1_vision_suggestion, onSubmit };
    const { rerender } = render(<DraftReview donationId="don_1" {...props} />);
    fireEvent.change(screen.getByLabelText(/^Dish name/i), { target: { value: "Soup" } });
    fireEvent.click(screen.getByLabelText(/I attest/i));
    rerender(<DraftReview donationId="don_2" {...props} />);
    // a new donation starts again from its own AI draft: what the donor typed for the old one is gone
    expect(screen.getByLabelText(/^Dish name/i)).not.toHaveValue("Soup");
    expect(screen.getByLabelText(/I attest/i)).not.toBeChecked();
  });
});

describe("duplicate AI strings", () => {
  it("render every note without a React key collision", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      renderReview({
        suggestion: {
          ...scene1_vision_suggestion,
          uncertainty_notes: ["Cannot see inside.", "Cannot see inside."],
          questions_for_donor: ["Any nuts?", "Any nuts?"],
        },
      });
      expect(screen.getAllByText("Cannot see inside.")).toHaveLength(2);
      expect(screen.getAllByText("Any nuts?")).toHaveLength(2);
      expect(spy.mock.calls.flat().join(" ")).not.toMatch(/same key|unique "key"/i);
    } finally {
      spy.mockRestore();
    }
  });
});
