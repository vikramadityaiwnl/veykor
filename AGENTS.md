# AGENTS.md

Project-specific guidance for AI coding agents.

<!-- ASTRYX:START -->

Astryx v0.7.4 · 173 components
CLI: for frontend work, run every command as `npm run astryx --prefix web -- <cmd>` (shown below as `astryx ...`).

SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";

WORKFLOW — start every page from a template, never from scratch:

1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.
   Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.

RULES:

- No <div> — components handle all layout and spacing.
- Read `astryx docs layout` before changing a template's frame.
- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.
- Style with component props first, then tokens (var(--color-_|--spacing-_|--radius-\*)). No raw hex/px. Tailwind is compiled through the Vite plugin; use inline className utilities for custom styling. Do not use xstyle directly. Some templates use StyleX and need a compiler plugin; see `astryx docs styling-overview`.
- Palettes and custom colors go through the theme, never :root overrides. Run `astryx theme add <slug>` to import; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any raw <div>/<span>, @apply, or hardcoded #hex/px with the component or a token.

`astryx help` lists every command. Key ones beyond the workflow:
search "<query>" find any component / hook / doc / template
discover <words> integrations you could add
docs <topic> getting-started, principles, tokens, theme … (`astryx docs` lists all)
docs cli commands and API reference
docs authoring build an integration package, and every field it holds
upgrade --from <old version> --apply run after a dependency bump

<!-- ASTRYX:END -->

## Project conventions

### Naming

- Name every file in kebab-case, using lowercase words separated by hyphens (for example, `user-profile.tsx`). Conventional lowercase configuration names such as `package.json` and `tsconfig.json` are fine.
- Name React components in PascalCase, with the first character uppercase (for example, `App`, `UserProfile`). Keep the file name kebab-case even when the exported component is PascalCase.

### Formatting and readability

- Do not add explanatory code comments. Use clear names, structure, and whitespace instead. Preserve machine-readable directives required by tooling.
- Write code for a person who enjoys reading it. Match the surrounding formatting and preserve intentional whitespace when editing existing code.
- Use `npm run format` to check and format files. Prettier settings and ignore rules live in `.prettier/` and are loaded by this command. Keep import declarations on one line; the configured Prettier plugin enforces this. Keep consecutive imports together with no blank lines between them; the blank line goes after the whole import block, not inside it.
- Use Prettier for consistent two-space indentation, double quotes, semicolons, trailing commas, and multiline wrapping. Run `npm run format` after changes.
- Leave a blank line after imports, between top-level declarations, and between distinct logical steps inside a function. Separate state declarations, derived values, handlers, effects, and the JSX return into readable groups.
- Expand functions, conditional branches, async handlers, and substantial JSX into multiple lines. Use braces for control-flow branches; do not compress a component or several statements onto one line.
- Keep JSX props on separate lines when the element has several props. Separate major JSX sections with blank lines so the page structure is easy to scan.
- Prettier handles mechanical formatting; retain meaningful blank lines and clear grouping manually. Do not remove that spacing to make a file shorter.

### Component props

- Give a component its own `Props` interface and accept one explicitly typed `props` object. If a module holds multiple components, use a distinct `<ComponentName>Props` interface for each. Read values as `props.x` and `props.y`; do not destructure the props parameter.

```tsx
import { Text } from "@astryxdesign/core/Text";

interface Props {
  x: string;
  y: number;
}

function App(props: Props) {
  return (
    <Text>
      {props.x} {props.y}
    </Text>
  );
}
```

### Component files

- Keep one exported function component in each file. Each feature folder owns its composing layout or screen file directly (for example, `web/src/workspace/workspace-layout.tsx`); every smaller rendering piece it composes lives beside it in that feature's `components/` folder, one kebab-case file per component (for example, `web/src/workspace/components/sidebar-sections.tsx`).
- The layout file wires stores, router state, and dialogs and renders the feature frame; it must not define rendering pieces inline. Split a growing piece into its own file in `components/` instead of adding another rendering component to the layout or to a sibling file, so each file carries only the context its one component needs.
- Non-rendering code such as stores, data, and helpers stays outside `components/` in its owning domain folder.

### Backend default state

- Give new database fields a database default in the schema and its migration, and seed any default rows a new account needs when the account is created (or in the migration for existing accounts).
- Always return a complete default state from the backend instead of `null` or omitted fields: empty arrays, empty strings, `0`, and `false` for empty values. The UI renders that shape directly and must not need optional chaining or null checks to handle an empty result.
- Project creation is host-only: `POST /api/projects` rejects non-host requests with 403 via `isHostRequest`, and the UI hides project creation affordances when `registrationAllowed` is false. Reads, renames, sections, chats, and sessions stay open to any authenticated user.

### Shared code

- Put all code genuinely shared by `web/` and `server/` in `shared/`, grouped by domain or concern (for example, `agents/` or `auth/`).
- Keep a domain's shared interfaces, contracts, types, and runtime-neutral helpers together in its domain folder. Do not split them into top-level `contracts/`, `helpers/`, or `types/` trees; keep small concerns in one file instead of adding unnecessary nested folders.
- Keep browser-only, Node-only, database, and framework-specific code in its owning app. Keep route implementations and framework-specific route registration in `web/` or `server/`. Update the shared domain definition first when a cross-layer contract changes.

### Documentation

- Keep `README.md` focused on the project overview, prerequisites, setup, and commands. Do not add feature implementation details, session reports, or verification audits.

### Brand and typography

- The product name is `veykor`; preserve this exact lowercase spelling in UI copy, metadata, and new screens unless the user changes it.
- Use Plus Jakarta Sans, body copy at weight 300, and semibold (600) page titles and headings across screens.

### Git and pull requests

- Write commit subjects in Conventional Commits form: `<type>(<optional-scope>): <summary>` (for example, `feat(web): add sign-in flow`). Omit the scope when it adds no useful context. Keep every commit message to that single subject line, at most 72 characters, with no body, matching the short style of the existing history. Do not commit when the user has asked to review changes first or has not authorized a commit.
- For a pull request, determine the base from the branch's parent in the branch/PR chain. In a stacked chain, target the immediate parent branch. Use an explicitly requested target when supplied; if the parent cannot be determined confidently, ask rather than defaulting to `main`.
- Summarize the complete branch relative to the selected base, including all commits and changes on the branch, not only work from the current session. Review the full branch diff before creating the PR.
- Create the pull request against that base and merge it into that same base once required checks and review conditions pass, unless the user specifies a different target or asks to leave it open.
