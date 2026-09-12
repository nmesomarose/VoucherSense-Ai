---
name: ui-design-tokens
description: Use when styling or changing the UI — adding/editing CSS, building screens, or applying brand colours, spacing, typography, shadows, or status badges. Triggers on words like design token, CSS variable, style, colour, colour role, spacing, typography, badge, theme, UI.
---

# UI Design Tokens

The UI is token-driven. Referencing anything outside the token layer breaks
consistency and is a lint-able offence in review.

## The three layers (know which one you are in)

1. `design-tokens.css` — auto-generated, NEVER edited. Holds primitives
   (`--primitive-colour-*`), colour roles (`--colour-roles-*`), effects
   (`--effect-*`), spacing (`--spacing-collection-*`), typography
   (`--typography-*`).
2. `app/globals.css` `:root` — defines the app semantic layer `--vs-*`
   (wraps roles + primitives, plus radii/shadows/font).
3. Components/screens — consume `--vs-*` tokens only.

## The semantic token set

Colours:

```
--vs-primary                 --vs-on-primary
--vs-primary-container       --vs-on-primary-container
--vs-secondary               --vs-on-secondary
--vs-secondary-container     --vs-on-secondary-container
--vs-tertiary                --vs-on-tertiary
--vs-tertiary-container      --vs-on-tertiary-container
--vs-error                   --vs-on-error
--vs-error-container         --vs-on-error-container
--vs-warning-container       --vs-on-warning-container   (confidence / warn notes)
--vs-surface                 --vs-surface-variant
--vs-on-surface              --vs-on-surface-muted
--vs-outline                 --vs-outline-strong
--vs-hover                   --vs-primary-tint
--vs-brand                   --vs-bg
```

Spacing step scale: `--vs-space-1` 4, `--vs-space-2` 8, `--vs-space-3` 12,
`--vs-space-4` 16, `--vs-space-5` 18, `--vs-space-6` 24, `--vs-space-8` 32.
Radius: `--vs-radius-sm` 10, `--vs-radius` 12, `--vs-radius-md` 14.
Shadows: `--vs-shadow-sm`, `--vs-shadow-soft`, `--vs-shadow-medium`,
`--vs-shadow-hard`. Font stack: `--vs-font` ("DM Sans", fallbacks).

## Conversions to apply in existing CSS

When you find a raw primitive in UI CSS, replace it with the semantic token:

| Raw primitive | → Use |
|---|---|
| `primary-*-90`-style container fills | `var(--vs-primary-container)` |
| `secondary-*-90` / `secondary-*-30` fills | `var(--vs-secondary-container)` / `var(--vs-on-secondary-container)` |
| `tertiary-*-90` / `tertiary-*-40` fills | `var(--vs-tertiary-container)` / `var(--vs-tertiary)` |
| `error-*-90` / `error-*-30` fills | `var(--vs-error-container)` / `var(--vs-on-error-container)` |
| `neutral-*-99/-20` surfaces/text | `var(--vs-surface)` / `var(--vs-on-surface)` |
| `neutral-variant-*-60/-80/-95/-70` | `var(--vs-on-surface-muted)` / `var(--vs-outline)` / `var(--vs-surface-variant)` / `var(--vs-outline-strong)` |
| `primary-*-95` tint | `var(--vs-primary-tint)` |
| hardcoded `#fff` on a colour button | `var(--vs-on-primary)` |

## Status badge recipe

Badge = pill (`border-radius: 999px`) using container + on-container pairs:

- pending / queued → `--vs-primary-container` + `--vs-on-primary-container`
- processing → `--vs-tertiary-container` + `--vs-tertiary`
- done / low-confidence → `--vs-secondary-container` + `--vs-on-secondary-container`
- failed / rejected → `--vs-error-container` + `--vs-on-error-container`

## Typography scale (from tokens)

`--typography-display-*` (64/50/40px) for heroes,
`--typography-headline-*` (32/28/24px) for page titles,
`--typography-title-*` (22/16/14px) for cards/buttons,
`--typography-body-*` (16/14/12px) for content,
`--typography-label-*` (14/12/11px) for captions/table headers. Prefer these
over bespoke sizes.

## Finishing a UI change

1. Grep the diff for `--primitive-colour-` (should be none outside `:root`).
2. Grep for hardcoded hex colours in TSX (should be none).
3. Confirm status colours use the semantic pairs above.
4. Check narrow screens (≤480px collapse to single column).
5. Run `npm run lint`; typecheck covers TS only, so the token greps are what
   actually guard the design system.