# Rules — Design Tokens & UI (VoucherSense AI)

These rules govern every CSS/UI change. They exist so the design system stays
consistent and the "auto-generated" token file stays untouched. Source of truth
for values is `design-tokens.css` (auto-generated from
`design-tokens.tokens.json` — never edit it by hand).

## The token layering

| Layer | Where it lives | Use |
|---|---|---|
| 1. Primitives | `design-tokens.css` `--primitive-colour-*` | NEVER referenced by UI or component CSS. Foundational raw palettes. |
| 2. Colour roles | `design-tokens.css` `--colour-roles-*` | Semantic role pairing (primary/on-primary/container…) built from primitives. |
| 3. App semantic layer | `app/globals.css` `:root` `--vs-*` | **The only tokens UI may consume.** Components and screens reference `--vs-*` exclusively. |

Rules:
1. **Never use `--primitive-colour-*` in UI code or component CSS.** If a value
   is needed directly, add/pick a `--vs-*` semantic token in `globals.css` that
   references the primitive once, then use the alias everywhere.
2. `--colour-roles-*` are acceptable in `globals.css` token definitions, but
   components should still use the `--vs-*` alias so intent (surface / text /
   container) is spelled out.
3. **No hardcoded hex/rgba colours in components** (`style={{ color: "#fff" }}`
   or `rgba(...)`). Use a `--vs-*` token. Existing exceptions (brand mark uses a
   token) stay token-based.
4. Extending the palette: define new `--vs-*` tokens in `globals.css` `:root`
   by mapping existing `--colour-roles-*` / primitives. Prefer referencing a
   role over a raw primitive.
5. Spacing: use the tokenised step scale `--vs-space-*` (4/8/12/16/18/24/32px)
   or the raw `--spacing-collection-*` tokens — never ad-hoc px for layout gaps.
6. Typography: sizes/weights come from the `--typography-*` tokens or their
   `--vs-text-*` aliases. Use the design scale (display / headline / title /
   body / label), not arbitrary px values.
7. Shadows: map to `--effect-*` tokens via `--vs-shadow-*` aliases
   (`--vs-shadow-sm`, `--vs-shadow-soft`, `--vs-shadow-medium`,
   `--vs-shadow-hard`).
8. Radius: use `--vs-radius-sm` / `--vs-radius` / `--vs-radius-md` (10/12/14px).
9. Status colours are semantic: `pending` → primary container, `processing` →
   tertiary container, `done`/confidence → secondary container, `failed` →
   error container. Do not invent new status palettes.

## Status → token map

| Status / intent | Container token | On-container token |
|---|---|---|
| pending / selected | `--vs-primary-container` | `--vs-on-primary-container` |
| processing / in-flight | `--vs-tertiary-container` | `--vs-tertiary` / `--vs-on-tertiary-container` |
| done / confidence | `--vs-secondary-container` | `--vs-on-secondary-container` |
| failed / error | `--vs-error-container` | `--vs-on-error-container` |

## Editing checklist

- Search the file for any `--primitive-colour-` reference and replace with the
  `--vs-*` semantic token.
- No new hardcoded colours or px spacing outside the scale.
- Preview both light and narrow-width screens (the UI is responsive to ~360px).
- Verify `npm run lint` passes; CSS token mistakes don't fail typecheck, so
  grep the diff for raw primitives before finishing.