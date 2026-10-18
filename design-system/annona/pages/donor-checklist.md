# Donor Checklist Page Overrides

> **PROJECT:** Annona
> **Generated:** 2026-10-18 03:01:57
> **Page Type:** Search Results

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content
- **Sections:** Hero (benefit headline) > Lead magnet preview (ebook cover, checklist, etc) > Form (minimal fields) > CTA submit

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Lead magnet: Professional design. Form: Clean white bg. Inputs: Light border #CCCCCC. CTA: Brand color

### Component Overrides

- Avoid: No feedback after submit
- Avoid: Placeholder-only inputs
- Avoid: Icon buttons without labels

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Tonal elevation (overlay colors instead of strong shadows), pill-shaped buttons and chips (borderRadius 999), emphasized easing Easing.bezier(0.2,0,0,1), state layers (pressed overlays 10–15% opacity), Reanimated-filled label float for inputs, HapticFeedback on FAB/toggles
- Forms: Show loading then success/error state
- Accessibility: Use label with for attribute or wrap input
- Accessibility: Add aria-label for icon-only buttons
- CTA Placement: Form CTA: Submit button
