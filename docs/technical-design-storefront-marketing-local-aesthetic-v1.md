# Technical design v1: Marketing landing page — “locally designed” professional aesthetic

## 1. Problem

The root marketing page (`apps/storefront/src/pages/index.astro`) is structurally sound and copy-approved, but its visual language reads as **generic modern SaaS**: centered hero, symmetrical three-column feature grid, soft radial “glow” backgrounds, dark primary buttons on white, and system-adjacent typography. Stakeholders perceive this as **“typical AI-generated”**—not because the layout is wrong, but because it matches a **narrow set of recurring patterns** (hero + 3 cards + glass nav) without **place, texture, or editorial voice** in the visuals.

We want a look that still feels **professional and trustworthy** for schools, churches, and small organizations, but signals **human craft** and **local/community context** rather than anonymous product-template aesthetics.

## 2. Goals

| Goal                            | Description                                                                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Distinctive, not decorative** | Move away from interchangeable “startup landing” tropes toward choices that feel intentional (type, rhythm, imagery, asymmetry).                                      |
| **Locally grounded**            | Visual cues that suggest **community, neighborhood, and gathering** without stock clichés or childish metaphors.                                                      |
| **Brand coherent**              | Stay aligned with the **light, airy** public portal pages (`/[slug].astro`) and BuddyBubble’s indigo/violet-friendly palette—avoid another full theme fork.           |
| **Accessible & fast**           | WCAG-minded contrast, no reliance on heavy animation, prefer static or CSS-only effects; **no** mandatory client JS for layout.                                       |
| **Copy-stable**                 | Preserve **locked marketing strings** (nav labels, hero headline/badge/subhead, primary CTA text) unless product explicitly approves copy changes in a separate pass. |

## 3. Non-goals (v1 design)

- Replacing Tailwind or rebuilding the page in another framework.
- Adding a full design system / Figma handoff in this document (this doc defines **direction and acceptance criteria**).
- Custom illustration commissions or paid stock libraries as **requirements** (optional enhancements only).
- Dark-mode parity for the marketing page (can be a follow-up).

## 4. Diagnosis: why it reads as “AI / template”

These patterns are common in **LLM-assisted** and **template-first** UIs; none are “wrong,” but **stacking them** produces the generic look:

| Signal                                    | Why it feels generic                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Perfect symmetry**                      | Single-column centered hero + equal 3-column grid is the default “landing page” composition.                            |
| **Abstract gradient blobs**               | Soft indigo/violet radials read as “modern SaaS mesh” without anchoring imagery or texture.                             |
| **Inter-like neutral sans everywhere**    | Safe and legible, but indistinguishable from thousands of sites.                                                        |
| **Identical card treatment**              | Three same-sized white boxes with icon pills feels like a component demo.                                               |
| **No photography or editorial hierarchy** | Real communities are shown through **people, places, and calendars**—absence of imagery defaults to “software product.” |
| **Uniform spacing scale**                 | Perfect `py-24` / `gap-6` rhythm feels **designed by grid**, not by story.                                              |

**Key insight:** “Locally designed” is less about **ornament** than about **specificity**—type choices, asymmetry, photography or illustration with a point of view, and typographic hierarchy that feels edited.

## 5. Design principles (target state)

1. **Asymmetry with restraint** — Break the “everything centered” default: e.g. left-aligned hero on large screens, offset feature band, or staggered card heights (still responsive).
2. **Editorial typography** — Pair a **neutral UI sans** (body/UI) with a **display serif or humanist serif** for the hero headline only, or use a **distinct grotesk** with character (see §6). Load via `font-face` or a single Google Font pair—keep performance in mind.
3. **Texture over glow** — Prefer **paper-like off-white**, **very subtle grain** (CSS noise SVG or low-opacity overlay), or **soft section bands** (not neon blobs). If gradients remain, **bind them to layout** (e.g. behind one column only).
4. **Human proof** — One **authentic photography** slot (community table, school hall, church steps, main street—**diverse, not corny**) or a **single custom illustration** in BuddyBubble colors. If no asset yet, use a **strong typographic block** + **testimonial pull-quote** as interim “human” presence.
5. **Feature section as “story,” not “grid”** — Alternate **image / text** rows, or a **bento** layout (one large, two small) so the section doesn’t read as three equal API features.
6. **Micro-detail** — Thin rules, small caps for labels, **hand-tuned** `letter-spacing` on the badge, **not** default uppercase tracking everywhere.

## 6. Typography strategy (recommended direction)

**Baseline (implementation-friendly):**

- **Body / UI:** Keep a clean sans (existing stack or `Inter`/`system-ui`) for nav, buttons, and card body copy—readability first.
- **Headline (hero):** Introduce one **display** face for `Your Organizational Ecosystem.` only—e.g. **Fraunces**, **Source Serif 4**, **Libre Baskerville** (tasteful, not gimmicky), or a **quirky grotesk** (e.g. **DM Sans** / **Sora** if we want modern but less “Inter”).

**Rules:**

- Max **two families** on the page (plus system fallbacks).
- Headline: `font-normal` or `font-medium` at large sizes often reads more “editorial” than `font-extrabold`—evaluate in browser; extrabold can feel “template hero.”
- Set a **max line length** for subhead (already ~`max-w-2xl`); consider **slightly larger** body line-height for “inviting” copy.

## 7. Layout & composition

### 7.1 Hero

- **Large screens:** Two-column split—**text left**, **visual right** (photo, illustration, or abstract shape). Or full-bleed **photo with left-aligned type** in a scrim (community-oriented).
- **Small screens:** Stack (image optional below fold to save LCP if image is heavy).

### 7.2 “Proof strip” (new, lightweight)

A thin band below the hero: **3 short bullets** or **logos / partner placeholders** (“PTAs · Youth groups · Main Street shops”)—**copy to be approved separately**; visually it breaks “hero + button only.”

### 7.3 Features

Replace **3 equal cards** with one of:

- **Bento grid** (CSS grid areas): one wide card (Digital front porch), two stacked (Private bubble, More than chores).
- **Alternating rows:** Icon + copy left, subtle divider, next row reversed.
- **Staggered masonry feel** (lightweight): varied top padding or `md:` column spans—still static HTML.

## 8. Color, surface, and background

- **Keep** light foundation: off-white (`stone-50` / warm gray) vs pure white to reduce clinical coldness.
- **Reduce** full-viewport abstract gradients **or** confine them to **one** section (e.g. hero only) with a **hard edge** into a flat section—reads more “designed” than “ambient wallpaper.”
- **Accent:** Single **BuddyBubble indigo** (`indigo-600`–`violet-600` range) for links, badge border, and one CTA variant—avoid rainbow icon pills unless each maps to a **semantic** meaning (public / private / creative).

## 9. Imagery & assets

| Option                                               | Pros                   | Cons                                                          |
| ---------------------------------------------------- | ---------------------- | ------------------------------------------------------------- |
| **A. One authentic photo** (community setting)       | Fastest “local” signal | Needs rights-cleared asset; LCP if not optimized              |
| **B. SVG illustration** (simple line + wash)         | Lightweight, on-brand  | Needs illustrator time or a tight brief                       |
| **C. CSS-only “scene”** (abstract shapes + patterns) | No asset dependency    | Easy to slip back into “generic abstract” if not art-directed |

**Recommendation:** Plan for **A or B**; use **C** only as interim with **strong** typography and asymmetry so it doesn’t look like default blobs.

**Performance:** Single hero image: `width`/`height`, `loading="eager"` only for LCP candidate; WebP/AVIF via Astro/Vercel; blur placeholder optional.

## 10. Motion & interaction

- **Default:** No auto-playing video; **no** parallax dependency.
- **Optional:** Subtle `transition` on buttons/links; **reduced motion** (`prefers-reduced-motion: reduce`) disables decorative transitions.

## 11. Accessibility & content

- Maintain **4.5:1** contrast for body text on section backgrounds; test hero text if overlaid on photography (use gradient scrim).
- **Badge** “Community Engagement Forum”: ensure uppercase + tracking doesn’t harm readability at small sizes.
- Footer placeholder links (`#`) should become real routes or `aria-disabled` pattern when legal pages exist.

## 12. Implementation phases (suggested)

| Phase                               | Scope                                                                                                                                                               | Outcome                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **P0 — Foundation**                 | Typography pair (import + `font-family` tokens in `global.css` or layout), hero alignment shift, tone down / localize background treatment, button hierarchy polish | Noticeably less “template” without new assets |
| **P1 — Layout story**               | Replace 3-equal-cards with bento or alternating rows; add proof strip (copy TBD)                                                                                    | Stronger editorial rhythm                     |
| **P2 — Photography / illustration** | Hero visual + optional second image in features                                                                                                                     | “Local” signal strongest                      |
| **P3 — Optional**                   | Light grain overlay, testimonial block, small “made for communities” footnote                                                                                       | Delight + trust                               |

**Estimated touch surface:** Primarily `apps/storefront/src/pages/index.astro`, `apps/storefront/src/styles/global.css`, and possibly a **small** shared partial (e.g. `MarketingShell.astro`) if we split sections—avoid sprawl.

## 13. Acceptance criteria (for “done” on P0+P1)

- [ ] Page no longer presents as **only** centered hero + three equal cards (composition asymmetry or clear visual hierarchy).
- [ ] **Two-type** system in use (display + UI) OR documented decision to stay single-family with **stronger** weight/spacing system.
- [ ] Background treatment is **either** restrained to one section **or** replaced with texture/paper tone—not full-viewport generic mesh only.
- [ ] Lighthouse: no major regression on **LCP** vs current (target: address hero image if added).
- [ ] **Locked strings** preserved unless explicitly changed in copy review.

## 14. Open questions (for stakeholder review)

1. **Photography:** Do we have brand-owned community photos, or should we budget stock with a strict brief (diversity, non-staged)?
2. **Voice in UI:** Should the proof strip use real customer names later, or generic categories only for v1?
3. **Dark mode:** Out of scope for v1—confirm.

## 15. References (internal)

- Current marketing page: `apps/storefront/src/pages/index.astro`
- Public portal aesthetic reference: `apps/storefront/src/pages/[slug].astro`
- Related product design: `docs/technical-design-public-community-portals-v1.md`

---

**Document status:** Draft for review — no implementation committed until approved.
