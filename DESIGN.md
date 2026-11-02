# veykor Design Foundations

This project uses **ASTRYX** with the **neutral** theme. Keep screens visually and behaviorally consistent by building on ASTRYX components and semantic tokens instead of introducing one-off styles.

Reference: [ASTRYX documentation](https://astryx.atmeta.com/docs/getting-started), especially [Principles](https://astryx.atmeta.com/docs/principles), [All Tokens](https://astryx.atmeta.com/docs/tokens), [Color](https://astryx.atmeta.com/docs/color), [Spacing](https://astryx.atmeta.com/docs/spacing), and [Typography](https://astryx.atmeta.com/docs/typography).

## Product identity

- The product name is **veykor**, always lowercase. Keep the spelling in titles, labels, metadata, and new screens.
- Use **Plus Jakarta Sans** throughout the UI. Body copy always uses weight **300**; page titles and headings use semibold **600**.
- Keep these type choices in the veykor theme extension: `typography.body` / `typography.heading` for the family and `--text-body-weight` plus `--text-supporting-weight` token overrides for weight 300. Set page heading weights to the semibold token. Load the font before rendering the theme.
- Use the neutral theme as the default. Do not add per-screen palettes or override the theme with root-level colors.
- Keep brand expression quiet and direct: let hierarchy, whitespace, and clear actions do the work.

## ASTRYX implementation rules

- Import components from their dedicated entry points, such as `@astryxdesign/core/Button`.
- Use ASTRYX components for patterns they cover. Use `Heading` for document headings, `Text` for other copy, and `Stack`/`HStack`/`VStack`/`Grid` for layout and spacing.
- Read `npx astryx component <Name>` before adding or changing a component. Use documented props; do not invent APIs.
- Use the ASTRYX `Dialog` default padding for dialog content. Do not set `padding={0}`; the default provides the dialog's standard inset and spacing.
- Start larger screens from the closest ASTRYX template. Set the shell and its regions before filling in content. For a small component preview, use the component and the lightest layout wrapper needed.
- Keep dense information in edge-to-edge rows or tables with dividers. Use cards for independent widgets, galleries, or grouped settings rather than wrapping every section in a card.
- Import `@astryxdesign/core/reset.css` and `@astryxdesign/core/astryx.css` once at the app entry and wrap the app in the selected `Theme`.
- Treat ASTRYX styles as layered CSS. If another reset or styling system is added, explicitly plan the cascade layer order; unlayered CSS overrides layered ASTRYX styles.
- Use the supported styling setup. Component props come first; StyleX overrides require a StyleX compiler. Do not add raw utility classes or unsupported `xstyle` styles without configuring that compiler.
- Do not use raw hex colors, arbitrary pixel spacing, inline styles on raw elements, or unnecessary wrapper elements. Use components and semantic tokens.

## Color and surfaces

Color tokens describe purpose and adapt to light/dark mode and the active theme. Use semantic variables, never their literal hex values.

- **Surfaces:** `--color-background-body` → `--color-background-surface` → `--color-background-card` → `--color-background-popover`. Use these roles to establish layering.
- **Text:** `--color-text-primary` for main content, `--color-text-secondary` for supporting content, `--color-text-disabled` for unavailable controls, and `--color-text-accent` for links or emphasis.
- **Icons:** `--color-icon-primary`, `--color-icon-secondary`, `--color-icon-disabled`, and `--color-icon-accent` mirror the text hierarchy.
- **Borders:** `--color-border` for subtle separation and `--color-border-emphasized` for stronger boundaries.
- **Actions:** use component variants and `--color-accent` / `--color-on-accent` for primary actions; do not create a competing accent palette.
- **Status:** use `--color-info`, `--color-success`, `--color-warning`, and `--color-error` only for their matching meaning. Use their `-muted`, `--color-on-*`, `--color-text-*`, `--color-icon-*`, and `--color-border-*` roles for supporting treatments.
- **Data visualization:** use `--color-data-categorical-*` for distinct series, `--color-data-neutral` for labels/reference lines, and sequential `--color-data-<hue>-1` through `-5` ramps for ordered values (5 darkest, 1 lightest). Keep chart colors separate from interface status colors.
- Use `--color-overlay`, `--color-overlay-hover`, and `--color-overlay-pressed` for overlays and interaction states through system components.

## Spacing and sizing

ASTRYX spacing follows a 4px base unit in `rem`: each step is `0.25rem` at the default root size. Prefer component `gap` and padding props where available.

| Token          |     Value | Token           |      Value |
| -------------- | --------: | --------------- | ---------: |
| `--spacing-0`  |    `0rem` | `--spacing-0-5` | `0.125rem` |
| `--spacing-1`  | `0.25rem` | `--spacing-1-5` | `0.375rem` |
| `--spacing-2`  |  `0.5rem` | `--spacing-3`   |  `0.75rem` |
| `--spacing-4`  |    `1rem` | `--spacing-5`   |  `1.25rem` |
| `--spacing-6`  |  `1.5rem` | `--spacing-7`   |  `1.75rem` |
| `--spacing-8`  |    `2rem` | `--spacing-9`   |  `2.25rem` |
| `--spacing-10` |  `2.5rem` | `--spacing-11`  |  `2.75rem` |
| `--spacing-12` |    `3rem` |                 |            |

- Supported layout `gap` steps are `0`, `0.5`, `1`, `1.5`, `2`, `3`, `4`, `5`, `6`, `8`, and `10`. Use smaller steps for tightly related controls and larger steps for distinct groups and sections.
- Prefer `gap`/padding props over manually added margins. For custom StyleX layouts, import `spacingVars` from `@astryxdesign/core/theme/tokens.stylex`.
- Control heights use `--size-element-sm` (`28px`), `--size-element-md` (`32px`), and `--size-element-lg` (`36px`). Prefer component `size` props over setting heights yourself.
- Borders use `--border-width` (`1px`). Focus rings use `--focus-outline-width` (`2px`), `--focus-outline-style` (`solid`), `--focus-outline-color` (`var(--color-accent)`), and `--focus-outline-offset` (`3px`). Keep the visible keyboard focus state.

## Shape and elevation

- Radius tokens are theme-scaled except the fixed `none` and `full` anchors. The ASTRYX reference scale names `--radius-none`, `--radius-inner`, `--radius-element`, `--radius-container`, `--radius-page`, `--radius-chat`, and `--radius-full`; the documented base values are `0`, `8`, `12`, `16`, `32`, `28`, and `9999px` respectively.
- The installed neutral theme adjusts that scale: `--radius-inner` is `0.375rem`, `--radius-element` is `0.625rem`, `--radius-container` is `0.75rem`, and `--radius-page` is `1.75rem`; `none` and `full` stay fixed. Use component defaults when possible; use element radii for controls, container radii for panels, and full radii for pills. Semantic token names are the contract; do not copy reference values into custom CSS.
- Use elevation only to express stacking: `none` for embedded content, `low` for an in-flow surface that needs separation, `med` for surfaces over nearby content, and `high` for a topmost modal layer. Prefer component `elevation` props and `--shadow-low`, `--shadow-med`, or `--shadow-high`; do not hand-write shadows.

## Typography

- veykor extends ASTRYX neutral and uses **Plus Jakarta Sans** for body and headings, loaded from Google Fonts in the document head. Code uses SF Mono/system monospace. ASTRYX sets font tokens but does not download font files itself.
- The default geometric size ramp uses a `14px` base and `1.2` ratio, expressed in `rem`: `4xs` `0.375rem`, `3xs` `0.4375rem`, `2xs` `0.5rem`, `xs` `0.625rem`, `sm` `0.75rem`, `base` `0.875rem`, `lg` `1.0625rem`, `xl` `1.25rem`, `2xl` `1.5rem`, `3xl` `1.8125rem`, `4xl` `2.1875rem`, and `5xl` `2.625rem`.
- Use semantic `Heading` and `Text` types instead of setting font size, line height, or weight manually. The standard weights are normal `400`, medium `500`, semibold `600`, and bold `700`.
- Body text uses weight **300** as a veykor rule. Page titles and headings use semibold **600**. Use supporting type for metadata, timestamps, captions, and helper copy while preserving the 300 body-weight rule for prose.
- The semantic scale includes H1–H6, Display 1–3, Large, Body, Label, Code, and Supporting. Display styles are for hero/marketing/data callouts, not ordinary page sections.
- Keep heading levels in order. When visual size and document outline differ, use `Heading`'s accessibility-level support rather than skipping semantic levels.
- Line heights are computed from the scale and snapped to a 4px vertical grid; do not override individual line heights or size tokens to nudge one heading. If the whole ramp needs adjustment, tune its base and ratio through `defineTheme`.

## Empty states

- Use `EmptyState` for an empty list, no search results, a first-time setup, or a cleared inbox. The title is required and must name the specific empty thing (for example, “No projects yet”).
- Include a clear next step so users know how to proceed. Add a short description when it explains why the area is empty or what the user can do; use one or two action buttons when there is a useful next action.
- An optional icon or illustration should reinforce the context. Use the compact variant in cards or sidebars with limited space.
- Do not use generic “No data” copy or leave an empty state without guidance. Use a `Banner` for errors that need immediate attention.

## Motion and accessibility

- Use `--duration-fast` (`175ms`) for micro-interactions, `--duration-medium` (`410ms`) for entrances/exits and layout changes, and `--duration-slow` (`975ms`) for continuous motion. The available min/max bands are fast `130–230ms`, medium `310–550ms`, and slow `730–1300ms`.
- Use `--ease-standard` (`cubic-bezier(0.24, 1, 0.4, 1)`). Prefer component motion; for custom transitions use the duration/easing tokens and honor `prefers-reduced-motion`.
- Animate spatial changes when motion helps people track what changed. Keep frequent hover and row interactions immediate, never block interaction while animation runs, and make exits match the entrance direction.
- Keep accessible names on actions, preserve a logical heading outline, and ensure visible focus. Use a link for navigation and a button for actions.

## Responsive layout and content

- Build from the outside in: choose the shell, budget its regions, structure content, establish one content alignment line, tune spacing, then decide how each region changes at narrower widths.
- Prefer the weakest container that groups content well. Keep actions close to the content they affect and make long content wrap without losing important actions.
- For every state, provide intentional loading, empty, error, disabled, and success feedback using ASTRYX patterns and semantic tokens.

## Useful CLI references

- `npx astryx component <Name>` — props, examples, and best practices.
- `npx astryx docs tokens` — complete live token reference.
- `npx astryx docs principles --full` — system rules and anti-patterns.
- `npx astryx docs layout` — page framing and responsive decisions.
- `npx astryx doctor --built <dir>` — check a built app for system conventions.
