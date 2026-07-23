# Archived landing sections

These components are **unused by any current route**. They were verified
dead via a 6-axis check (direct imports, dynamic `import()`, `React.lazy`,
`require()`, string-token references, and `import.meta.glob` patterns) in
the DS-0 Design Foundation audit on commit `89a5ac8`.

They are retained here — not deleted — as migration references for the
upcoming Claude Design sync. A reviewer can read them to see the shape of
the previous landing layout, copy patterns that survive the redesign, or
restore one if a corresponding section becomes needed again.

## Files

- `CTASection.tsx`
- `CalibrationProofSection.tsx`
- `DecisionAuditTrailSection.tsx`
- `FeaturesSection.tsx`
- `HeroSection.tsx`
- `IntegrationsSection.tsx`
- `PainMirrorSection.tsx`
- `ProductPreview.tsx`
- `SocialProofSection.tsx`
- `TestimonialSection.tsx`

## Rules

- **Do not import** any file in `src/archive/**` from production code.
  Anything under `src/archive/` is, by convention, not part of the shipped
  product surface.
- TypeScript still compiles these files (they remain inside `src/`), so
  they continue to be type-checked against the current codebase. If a
  refactor breaks them, that is a signal that the archived shape no longer
  matches reality — choose to delete or update, do not silently let them
  rot.
- Live design-system primitives that survived the audit remain in
  `src/components/landing/`: `Navbar.tsx` (canonical public marketing
  navigation), `Footer.tsx` (canonical public marketing footer), and
  `ComparisonSection.tsx`.

## Provenance

Moved from `src/components/landing/` via `git mv` so the full file history
follows the rename. Run `git log --follow src/archive/landing/<file>` to
trace edits prior to the move.
