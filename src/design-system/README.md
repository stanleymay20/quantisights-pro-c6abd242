# Quantivis Design System

**Version:** DS-1 (Foundation)
**Source of truth:** `src/index.css` (tokens) and `tailwind.config.ts` (utility aliases)
**Status:** Foundation established. Page migrations follow in later sprints.

This document describes the philosophy and the token catalogue. It is the
contract every product surface — marketing, dashboard, trust, evidence —
is expected to align with. If a surface needs a value not in this
catalogue, the answer is to extend the catalogue, not to add another
inline literal.

---

## 1. Philosophy

Quantivis is a decision-governance product. Every visual decision has to
serve three audiences at once:

1. **Operators** — read dense, evidence-laden screens daily.
2. **Executives and approvers** — make defensible decisions from briefs.
3. **Procurement, audit, and compliance** — read the same screens through
   a different lens.

That shapes the rules below.

- Color is a **token**, never a literal. A reviewer can identify *why* a
  surface is the color it is — "executive navy", "evidence high-confidence
  green", "decision needs-review amber" — not just *what* HEX it is.
- Status, decision, evidence, and governance are **distinct concept
  layers** even when several layers currently resolve to the same hue
  (green / amber / red). Keeping them separate means a future tuning of
  one layer (say, raising contrast on evidence chips) does not silently
  retune another (status badges).
- Marketing surfaces and dashboard surfaces are **different design
  contexts**. The marketing surface is a presentation layer for buyers;
  the dashboard surface is an instrumented control surface for operators.
  Tokens carry that distinction explicitly (`--surface-marketing`,
  `--surface-dashboard`).
- We **change values, never names**. A retune of the brand blue happens
  by editing `--brand-primary` in one place. Names belong to the API.

---

## 2. Color tokens

All colors live in `src/index.css` as HSL triplets (`H S% L%`) so callers
can apply alpha via `hsl(var(--token) / 0.4)`. The Tailwind utility names
(`bg-brand-primary`, `text-status-warning`, etc.) are wired up in
`tailwind.config.ts`.

### 2.1 Brand layer

| Token | Light | Approx hex | Role |
|---|---|---|---|
| `--brand-primary` | `222 89% 55%` | `#2563EB` (approved DS-1 brand blue) | Default primary action color across the product. Aliases `--primary`. |
| `--brand-secondary` | `215 25% 27%` | `#324158` | Deep slate companion to primary; reserved for muted brand surfaces. |
| `--brand-accent` | `222 89% 55%` | `#2563EB` | Aliases `--accent`. Currently equal to primary by design. |
| `--brand-executive-navy` | `232 53% 25%` | `#1E2761` | Executive-tone deep navy. Used for marketing display type and dark hero sections. |
| `--brand-marketing-accent` | `232 99% 62%` | `#3D5AFE` | Brighter "marketing accent" blue used on the current homepage. **Intentionally preserved as-is in DS-1**; planned to align to `--brand-primary` in a later sprint. |
| `--brand-marketing-deep` | `219 49% 11%` | `#0E1628` | Deepest marketing background (homepage dark sections). |
| `--brand-marketing-muted` | `216 23% 97%` | `#F4F6F9` | Subtle muted background between marketing sections. |
| `--brand-marketing-slate` | `215 16% 47%` | `#64748B` | Marketing slate text. |

Marketing tokens have the same value in `.light` and `.dark` — the
marketing layer renders its own dark navy palette regardless of OS theme.

### 2.2 Surface layer

Surfaces describe *what kind of page area is being painted*, not what
color it is. They map to brand or system tokens.

| Token | Light value | Dark value | Used for |
|---|---|---|---|
| `--surface-marketing` | `0 0% 100%` | `0 0% 100%` | Default marketing page (white). |
| `--surface-marketing-dark` | `219 49% 11%` | `219 49% 11%` | Dark marketing hero / CTA strips. |
| `--surface-dashboard` | `210 20% 98%` | `220 45% 7%` | Dashboard background. Aliases `--background`. |
| `--surface-trust` | `0 0% 100%` | `220 42% 11%` | Trust Center surfaces. Aliases `--card`. |
| `--surface-evidence` | `210 15% 92%` | `220 32% 14%` | Areas surfacing evidence (lineage panels, evidence chips, source verifications). Aliases `--muted`. |
| `--surface-decision` | `0 0% 100%` | `220 42% 11%` | Decision-record cards and decision ledger rows. Aliases `--card`. |

### 2.3 Status layer

For ambient system status — uptime, validation, generic toasts.

| Token | Value (both modes) | Role |
|---|---|---|
| `--status-success` | `142 71% 45%` | Operational / passed validation / acknowledged. |
| `--status-warning` | `38 92% 50%` | Degraded / awaiting action. |
| `--status-danger` | `0 72% 51%` | Incident / failed validation / blocked. |
| `--status-info` | `199 89% 48%` | Neutral information indicator. |

Each has a matching `*-foreground` token chosen for ≥ 4.5:1 contrast on
the colored background.

### 2.4 Decision layer

For decision-record UI specifically (approve / reject / needs review).
Currently aligned to status colors but kept as a separate layer so future
tuning (e.g., a calmer green for "approve") doesn't silently move status
badges.

| Token | Value | Role |
|---|---|---|
| `--decision-approve` | `142 71% 45%` | Approval action / approved row. |
| `--decision-reject` | `0 72% 51%` | Reject action / rejected row. |
| `--decision-needs-review` | `38 92% 50%` | Pending / needs-review row. |

### 2.5 Evidence layer

For confidence visualization on AI-generated recommendations.

| Token | Value | Role |
|---|---|---|
| `--evidence-high-confidence` | `142 71% 45%` | ≥ 80 % confidence, calibrated. |
| `--evidence-medium-confidence` | `38 92% 50%` | 50–79 % confidence. |
| `--evidence-low-confidence` | `0 72% 51%` | < 50 % confidence or heuristic-derived. |

### 2.6 Governance layer

For compliance / risk surfaces (Trust Center, procurement pack, EU AI
Act mappings).

| Token | Value | Role |
|---|---|---|
| `--governance-risk` | `0 72% 51%` | Risk indicators, severity scaling. |
| `--governance-compliance` | `142 71% 45%` | Compliance affirmations, attested controls. |

### 2.7 Chart palette

Eight slots, semantic. Charts should consume `hsl(var(--chart-N))` via
`lib/chart-config.ts`. Choose by order, not by hue: chart-1 is always
primary, chart-2 is always success, etc.

| Slot | Maps to | Use |
|---|---|---|
| `--chart-1` | `--brand-primary` | First / primary series |
| `--chart-2` | `--status-success` | Success / positive |
| `--chart-3` | `--status-warning` | Warning / caution |
| `--chart-4` | `--status-danger` | Negative / loss |
| `--chart-5` | `--status-info` | Informational / neutral series |
| `--chart-6` | `--brand-marketing-accent` | Highlight / comparison series |
| `--chart-7` | slate / muted-foreground | Comparison / muted series |
| `--chart-8` | `--brand-secondary` | Long-tail series |

---

## 3. Typography

- **Display font:** **Space Grotesk** (300–700). Approved DS-1 decision.
  Applied to `h1–h6` via the base CSS layer.
- **Body font:** Inter (300–800).
- **Numeric / monospace:** monospace fallback (`font-family: monospace`).
  Reserved for IDs (e.g., `DL-2847`), timestamps, and code-like cells.

Type scale is the Tailwind default (`text-xs / sm / base / lg / xl / 2xl
… 9xl`). DS-1 does not introduce a new scale. Repo-wide migration of the
~1400 arbitrary `text-[Npx]` usages is queued for a future sprint.

Header rule of thumb: never use display fonts for body content; never use
the body font for marquee headings.

### 3.1 Heading semantics

| Tag | Default voice |
|---|---|
| `h1` | Page-level identity. Once per page. |
| `h2` | Section identity. |
| `h3` | Subsection / card title. |
| `h4` | Group / metadata label. |
| `h5` / `h6` | Use sparingly; usually a sign the page needs a richer component. |

### 3.2 Eyebrows / small caps

Eyebrows are upper-case lead-ins to a heading. Canonical pattern (used in
`Index.tsx` Sprint 1 cleanup):

```
font-size: 11px;
font-weight: 700;
letter-spacing: 0.18em;
text-transform: uppercase;
color: hsl(var(--brand-marketing-slate)) on light surfaces,
       hsl(var(--brand-marketing-muted) / 0.62) on dark surfaces.
```

A future sprint promotes this to an `<Eyebrow tone="light" | "dark">`
primitive.

---

## 4. Spacing

DS-1 does **not** introduce a custom spacing scale. Tailwind's 4 px-step
scale (`1` = 4 px through `96` = 384 px) is the contract. The most-used
steps in the codebase are `p-2` / `p-3` / `p-4` / `gap-2` / `gap-3` —
keep them as the visual rhythm.

Container width: **1400 px** (approved DS-1 decision; already configured
as `container.screens.2xl` in `tailwind.config.ts`). Page-local 1280 px
overrides (currently still in `Index.tsx`) align to 1400 px in a future
migration sprint.

---

## 5. Radius

| Token | Value | Use |
|---|---|---|
| `--radius` | `0.75rem` (12 px) | Base radius. Drives shadcn `rounded-lg/md/sm`. |
| `--radius-button` | `0.375rem` (6 px) | Buttons and pill toggles. Exposed as `rounded-button`. |
| `--radius-input` | `0.5rem` (8 px) | Form inputs, selects, textareas. Exposed as `rounded-input`. |
| `--radius-card` | `0.75rem` (12 px) | Cards. Exposed as `rounded-card`. Equal to `--radius`. |
| `--radius-dialog` | `0.75rem` (12 px) | Dialogs / sheets. Exposed as `rounded-dialog`. Equal to `--radius`. |

Existing `rounded-lg` / `rounded-md` / `rounded-sm` continue to work
unchanged. The component-named aliases above are additions, not
replacements. Sweeping migration of arbitrary `rounded-xl` / `rounded-2xl`
in shared components is queued.

---

## 6. Elevation

Three semantic shadow tokens, defined in `:root` and `.dark`:

| Token | Use |
|---|---|
| `--shadow-card` | Default card / panel resting elevation. |
| `--shadow-elevated` | Hover, focus, dropdowns, popovers, modals. |
| `--shadow-glow` | Primary affordances that need attention (CTAs, live indicators). |

Raw Tailwind shadow utilities (`shadow-sm / md / lg / xl`) survive but
should not be added to new shared components. They contribute roughly 80
unaudited usages today; sweep is queued.

---

## 7. Motion

Three durations, exposed both as CSS variables and as Tailwind
`duration-fast / normal / slow` utilities:

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | `150 ms` | Hover transitions, focus rings, micro-interactions. |
| `--motion-normal` | `250 ms` | Standard transitions (color, opacity, transform). |
| `--motion-slow` | `400 ms` | Drawer open/close, dialog enter/exit, large hero entrances. |

Honor `prefers-reduced-motion`: the base layer in `index.css` already
collapses animations to `0.01 ms` when the user opts out. New animated
components inherit that automatically — do not override.

---

## 8. Accessibility

Non-negotiable contract for every surface:

1. **Focus visibility.** `:focus-visible` outline (2 px solid
   `hsl(var(--ring))` with 2 px offset) is global. Do not remove.
2. **Skip link.** Every page-layout shell (`ProtectedShell`,
   `PublicPageNav`-wrapped routes) keeps a `Skip to main content` link
   that targets `#main-content`.
3. **Reduced motion.** Animations honor `prefers-reduced-motion: reduce`.
4. **Color is never load-bearing.** Status indicators carry an icon or a
   text label in addition to color. Do not encode meaning in hue alone.
5. **Contrast.** Body copy ≥ 4.5 : 1. Large text ≥ 3 : 1. Status badges
   ≥ 4.5 : 1 between background and foreground.
6. **Touch targets.** ≥ 44 × 44 px for any mobile-interactive surface
   (`.touch-target` utility provides this floor).
7. **`aria-current`** on active navigation links (Sprint 1 scroll-spy
   pattern). Not just a CSS state.

---

## 9. Semantic token usage

Rule: **reach for the token that names the role**, not the one that
matches the color.

| Need | Use | Avoid |
|---|---|---|
| Primary CTA color | `bg-brand-primary` / `--brand-primary` | A literal blue |
| Approve button on a decision row | `bg-decision-approve` | `bg-success` (status), `bg-emerald-600` (palette) |
| Confidence chip on a recommendation | `text-evidence-high-confidence` | `text-success` |
| Compliance badge in Trust Center | `text-governance-compliance` | `text-success` |
| Toast for a passed save | `bg-status-success` | `bg-decision-approve` |

The colors may currently be identical. The token name carries the
intent — and that intent is what we get to retune later without breaking
every other surface.

---

## 10. Marketing vs Dashboard surfaces

Two distinct design contexts that share tokens but not language.

| | Marketing | Dashboard |
|---|---|---|
| Audience | Buyers, procurement, board | Operators, approvers |
| Density | Spacious, headline-driven | Dense, data-driven |
| Background | `--surface-marketing` (light) or `--surface-marketing-dark` (dark sections) | `--surface-dashboard` |
| Display font | Space Grotesk (homepage currently still uses Georgia; migration queued) | Space Grotesk |
| Primary nav | `landing/Navbar.tsx` (DS-0 canonical) | `dashboard/DashboardSidebar.tsx` |
| Primary footer | `landing/Footer.tsx` (DS-0 canonical) | None — the dashboard runs full-bleed |
| Card affordance | Tall, generous padding, soft shadow | Compact, defined borders, tabular alignment |
| Tone | Persuasive, narrative, illustrative | Instrumented, evidence-laden, terse |

Marketing pages should never import from `src/components/dashboard/`. The
reverse is also forbidden.

---

## 11. Decision UI philosophy

Decision UIs are the user-facing layer of the audit trail. Every visual
decision in this layer has compliance weight, so the rules are tighter:

1. **A decision row must always show its three pillars together:**
   approve action, reject action, evidence trail link. None of the three
   is allowed to be hidden behind a hover, a menu, or a second click.
2. **Status of a decision is shown in three places:** a colored chip
   (decision layer), a status text label (e.g., "Approved"), and an
   `aria-label` (e.g., `aria-label="Approved by Jane Smith, 14m ago"`).
3. **Confidence is shown as a number** (e.g., "90%"). The color encoding
   on top is **secondary**. A screenshot in a board meeting should still
   convey the number even if the color is lost.
4. **An approval cannot be visually distinguishable from a placeholder.**
   If the row says "Approved", the audit trail must confirm an approval
   exists. We do not "fake" approval styling on draft rows.
5. **Reject is destructive but not noisy.** Reject buttons use
   `--decision-reject` for the outline / text, not for the fill. Filled
   destructive is reserved for confirmation dialogs.

---

## 12. Evidence visualization principles

The "Why should I trust this?" layer.

1. **Source is named.** Every evidence chip identifies its source — a
   dataset name, a connector, a calibration model. No anonymous evidence.
2. **Freshness is shown.** "Refreshed 2 minutes ago" beats "Live". The
   number is the truth; "Live" is decoration.
3. **Confidence is decomposed when expanded.** The trust card collapses
   to a single chip; expanded, it explains evidence strength, data
   quality, lineage, similar past decisions.
4. **Heuristic estimates are flagged.** When a confidence score was
   derived heuristically rather than from a calibrated model, the chip
   carries a visible warning marker. We never silently launder heuristic
   numbers as model numbers.
5. **Empty states are honest.** "Not scored yet" is allowed and is
   correct; "0%" is not.

---

## 13. Governance visualization principles

The "Will this hold up in audit?" layer.

1. **Certification status is shown with its real state.** "In progress
   — Q3 2026" is the right copy; "Compliant" without a controls map is
   forbidden.
2. **Risk and compliance use complementary tokens** (`--governance-risk`
   / `--governance-compliance`) so a procurement reviewer can scan a
   page and identify open risks at a glance.
3. **Append-only data has an explicit marker.** Audit logs, decision
   ledger rows, governance events — any append-only surface carries a
   small "append-only" badge so reviewers know revisions cannot rewrite
   history.
4. **EU AI Act / GDPR mappings are linked, not paraphrased.** When a
   surface claims alignment with Article 9 / 13 / 14, it links to the
   internal mapping that proves it.

---

## 14. Working with the tokens

### From CSS

```css
.my-component {
  background: hsl(var(--surface-trust));
  border: 1px solid hsl(var(--border));
  color: hsl(var(--brand-executive-navy) / 0.8);  /* alpha shorthand */
}
```

### From Tailwind

```tsx
<div className="bg-surface-trust border border-border text-brand-executive-navy/80">
  …
</div>
```

### From inline styles (legacy code paths)

```tsx
<div style={{ background: "hsl(var(--surface-marketing-dark))" }} />
```

Inline styles are not the preferred surface — prefer Tailwind utilities
or class-based CSS — but inline references resolve correctly when
required.

---

## 15. DS-2 shared primitives

DS-2 adds a small shared primitive layer in
`src/components/design-system/marketing-primitives.tsx`. It is deliberately
narrow: the goal is to give future migrations stable building blocks
without redesigning the homepage or migrating full pages.

Available primitives:

| Primitive | Purpose | Current adoption |
|---|---|---|
| `Eyebrow` | Canonical marketing eyebrow text using DS-1 marketing slate/muted tokens. | Low-risk homepage eyebrow replacements only. |
| `MarketingCard` | Wrapper for the existing `qv-card` / optional interactive card classes. | Low-risk homepage platform feature cards only. |
| `MarketingSection` | Section wrapper that maps surface intent to DS-1 surface tokens. | Low-risk homepage platform section only. |
| `TagBadge` | Semantic badge for homepage decision states using status/decision tokens instead of local HEX maps. | Replaces the homepage `TAG_STYLES` map. |
| `MarketingCTA` | Thin polymorphic wrapper for the existing `qv-primary-cta` / `qv-secondary-cta` classes. | Low-risk homepage CTA replacements only. |

DS-2 does not migrate full pages, does not replace the homepage layout,
does not change routes, and does not remove the remaining page-local
`qv-*` CSS. Those are deferred until the primitive layer has been used
and verified incrementally.

---

## 16. DS-3A homepage primitive adoption

DS-3A expands homepage use of the DS-2 primitive layer in small, safe
slices. It does not redesign or rewrite the page.

DS-3A keeps the homepage layout, Georgia typography, and 1280 px containers unchanged.

Adopted in this phase:

- `MarketingCTA` now covers the hero secondary CTA and pricing plan CTAs
  where anchor semantics already matched the primitive.
- `Eyebrow` now owns the repeated homepage section-eyebrow styling,
  including light and dark tones.
- `TagBadge` now covers the obvious decision-brief status chips that
  previously used one-off HEX styles.
- The local `qv-eyebrow*` classes were removed because the primitive now
  owns that styling directly.

Deferred intentionally:

- Button and React Router `Link` CTAs that do not match the current anchor
  primitive.
- Remaining `qv-*` layout, grid, card, nav, footer, and mock-frame classes.
- Georgia display typography migration.
- Container-width migration from 1280 px to the DS-1 1400 px contract.
- Full homepage or public-page migration.

---

## 17. DS-3B CTA primitive hardening

DS-3B hardens `MarketingCTA` so homepage CTAs can share one
design-system entry point without changing the visual output.

Supported cases after DS-3B:

`MarketingCTA` supports normal anchors, React Router links, external anchors, and submit buttons.

- normal anchors (`href="#demo"` and other same-page links);
- React Router links via `as={Link}` and `to="/..."`;
- external anchors via `external`, which adds safe new-tab attributes;
- submit buttons via `as="button"` and `type="submit"`.

Homepage adoption in this phase:

- The EU AI Act guide CTA moved from a direct React Router `Link` with
  `qv-primary-cta` to `MarketingCTA as={Link}`.
- The demo form submit button moved from a direct `button` with
  `qv-primary-cta` to `MarketingCTA as="button"`.

DS-3B does not change homepage layout, typography, routing, SEO,
security, backend logic, or the underlying `qv-primary-cta` /
`qv-secondary-cta` CSS. Those CSS classes remain intentionally because
`MarketingCTA` still uses them as its visual skin.

Deferred intentionally:

- Nav CTA sizing and footer/text links, because their visual affordance is
  not equivalent to the marketing CTA skin.
- Ledger approve/reject buttons, because they are product-action buttons,
  not marketing CTAs.
- Replacing the `qv-*` CTA CSS with tokenized Tailwind utilities.

---

## 18. Out of scope for DS-1 / DS-2 / DS-3A / DS-3B

These are deliberate deferrals. They are **not** failures of DS-1, DS-2,
DS-3A, or DS-3B.

- Homepage layout migration (Georgia → Space Grotesk; 1280 → 1400; the
  `qv-*` class set; the inline `<Nav>` and `<SiteFooter>`).
- Mechanical codemod of ~1397 `text-[Npx]` arbitrary font sizes onto a
  typed scale.
- Repo-wide audit of `rounded-xl` / `rounded-2xl` to align with the
  component-named radius tokens.
- Migration of `text-emerald-600` / `text-amber-600` references in trust
  and confidence helpers onto the new evidence/governance layers.
- Reconciling the homepage's `--brand-marketing-accent` (`#3D5AFE`) with
  `--brand-primary` (`#2563EB`).

Each should be its own focused sprint after DS-3B lands.
