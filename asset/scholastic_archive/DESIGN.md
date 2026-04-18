# Design System Specification: The Scholastic Archive

## 1. Overview & Creative North Star
**Creative North Star: "The Modern Archivist"**
This design system moves away from the bubbly, rounded ubiquity of modern messengers toward a "Tactical Scholastic" aesthetic. It draws inspiration from high-end architectural drafting and academic archives, blending the precision of a blueprint with the airy lightness of a morning library. 

The system breaks the "standard app" mold by utilizing **intentional asymmetry, diagonal motifs, and tonal depth** rather than traditional structural lines. We are building a "Digital Archive" that feels organized yet breathable—an intellectual space for AI interaction that prioritizes clarity, structure, and a refreshing, premium "Academy" atmosphere.

---

## 2. Colors & Surface Logic
The palette is a sophisticated interplay of pastel washes and muted accents. We avoid heavy blacks and dark blues to maintain an ethereal, lightweight feel.

### The "No-Line" Rule
**Prohibit 1px solid borders for sectioning.** Boundaries must be defined solely through background color shifts. For example, a `surface-container-low` section sitting on a `surface` background creates a natural edge. This forces a cleaner, more editorial look.

### Surface Hierarchy & Nesting
Depth is achieved through the "Layering Principle." Treat the UI as stacked sheets of fine, semi-transparent paper.
*   **Base:** `surface` (#f8f9ff) for the primary background.
*   **Secondary Content:** `surface-container-low` (#eef4ff) for subtle grouping.
*   **Interactive/Elevated:** `surface-container-highest` (#d4e4fa) for focus areas.

### The "Glass & Gradient" Rule
To elevate the "Archive" feel, use **Glassmorphism** for floating elements (like top navigation bars or sticky action buttons). Apply a semi-transparent `surface` color with a 20px-40px backdrop-blur. 
*   **Signature Gradient:** For primary CTAs, use a subtle linear gradient (135°) from `primary` (#3a5f94) to `primary-container` (#dbe6ff) to provide a "soulful" tactile depth.

---

## 3. Typography: Editorial Precision
The system uses a pairing of **Space Grotesk** for structural impact and **Manrope** for utilitarian legibility.

*   **Display & Headlines (Space Grotesk):** These should feel "architectural." Use `headline-lg` for screen titles. The wider apertures of Space Grotesk provide the "Academy" precision required.
*   **Body & Labels (Manrope):** All messaging and metadata utilize Manrope. We lean into the `medium` (500) weight for body text to ensure readability against the pastel backgrounds, using `on-surface-variant` (#43474c) for primary text to avoid the harshness of pure black.
*   **The "Scholastic" Detail:** Use `label-sm` in all-caps with 5% letter spacing for categories or timestamps to mimic archival filing systems.

---

## 4. Elevation & Depth: Tonal Layering
Traditional shadows are largely replaced by **Tonal Stacking**.

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` background to create a "lift" without a drop shadow.
*   **Ambient Shadows:** If a floating element (like a FAB) is necessary, use a "Tinted Shadow." Instead of grey, use a 6% opacity shadow tinted with `primary` color, with a blur of 16px and Y-offset of 8px.
*   **The "Ghost Border" Fallback:** If accessibility requires a border, use `outline-variant` (#c3c7cc) at **15% opacity**. High-contrast borders are strictly forbidden.

---

## 5. Components & Structural Motifs

### Chat Bubbles (The Signature Element)
*   **Geometry:** Asymmetric. Use `lg` (0.5rem) radius for three corners. The top corner facing the user’s avatar must be `none` (0px) or `sm` (0.125rem).
*   **Visual Motif:** Incorporate a 15-degree diagonal "clip" or slanted background fill on the sender's name to reinforce the tactical aesthetic.

### Buttons
*   **Primary:** Sharp corners (`md` - 0.375rem). Background uses the `primary` to `primary-container` gradient. Text is `on-primary` (#ffffff).
*   **Secondary/Tactical:** Background `secondary-container` (#cee9d9). Use for auxiliary AI actions.
*   **Slant Motif:** Button icons should be placed in a square container with a subtle diagonal background split to emphasize the "Archive" look.

### Chips & Tags
*   **Style:** Rectangular with `sm` (0.125rem) radius. Use `tertiary-container` (#f3e992) for "active" or "AI-generated" tags. No rounded pills.

### Input Fields
*   **Visual State:** No bottom line or full border. Use a solid `surface-container-high` fill. 
*   **Focus:** Indicate focus via a 2px vertical "accent bar" of `primary` on the left side of the input, rather than a perimeter glow.

### Lists & Cards
*   **Spacing as Divider:** Forbid the use of divider lines. Separate list items using `16px` of vertical white space or a subtle shift from `surface` to `surface-container-low`.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use 45-degree and 15-degree diagonal accents in background patterns or iconography.
*   **Do** leverage "whitespace" as a functional separator to keep the "Airy" academy feel.
*   **Do** use `secondary` (Lime) and `tertiary` (Yellow) only for highlights—the UI should remain 90% blue/grey.
*   **Do** ensure all "sharp" corners maintain a minimum `sm` radius for touch-device ergonomics.

### Don’t
*   **Don’t** use `R-full` (pills) for buttons or chips. It breaks the "Tactical Scholastic" precision.
*   **Don’t** use dark grey or black for text. It will feel too "heavy" for the pastel base. Stick to `on-surface-variant`.
*   **Don’t** use standard Material Design drop shadows. They look "cheap" in this editorial context.
*   **Don’t** use 1px dividers. If you feel you need a line, you likely need more whitespace or a subtle background tone shift instead.