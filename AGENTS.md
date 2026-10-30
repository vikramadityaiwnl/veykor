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
- Style with component props first, then tokens (var(--color-_|--spacing-_|--radius-\*)). No raw hex/px. No StyleX/Tailwind compiler here — don't use xstyle/utility classes directly. Some templates use StyleX and need a compiler plugin; see `astryx docs styling-overview`.
- Palettes and custom colors go through the theme, never :root overrides. Run `astryx theme add <slug>` to import; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or a token.

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

### Shared code

- Group shared files by domain/concern (for example, `auth/` or `visits/`); keep a small concern in one file instead of creating an unnecessary folder.
- `shared/contracts/` owns cross-layer request payloads and response contracts. Group related contracts by domain; keep each file kebab-case and export the public contract from its domain `index.ts` and `contracts/index.ts`.
- `shared/helpers/` owns small, runtime-neutral helpers whose implementation is genuinely shared by web and server. Keep browser-only, Node-only, database, and framework-specific code in its owning app. Re-export shared helpers through the relevant domain and `helpers/index.ts` barrels.
- `shared/types/` owns shared interfaces, type aliases, and other TypeScript types. Do not maintain duplicate copies of a cross-layer type in `web/` and `server/`; export public types through the relevant domain and `types/index.ts` barrels.
- Re-export the public category APIs from `shared/index.ts`. Web and server code should import through the stable shared entry point or category/domain `index.ts`, never from an implementation file. Renaming or moving an internal file should only require changing its barrel export.
- Keep route implementations and framework-specific route registration in `web/` or `server/`; shared contracts describe the payloads and responses, not router internals. Update the shared definition first when a cross-layer contract changes.
- `shared/package.json` owns scripts and development dependencies for the shared package. Update its `package-lock.json` whenever its dependencies change; use `npm install --prefix shared` to refresh it. `npm run typecheck --prefix shared` checks the shared source.

### Brand and typography

- The product name is `veykor`; preserve this exact lowercase spelling in UI copy, metadata, and new screens unless the user changes it.
- Use Plus Jakarta Sans, body copy at weight 300, and semibold (600) page titles and headings across screens.

### Git and pull requests

- Write commit subjects in Conventional Commits form: `<type>(<optional-scope>): <summary>` (for example, `feat(web): add sign-in flow`). Omit the scope when it adds no useful context. Do not commit when the user has asked to review changes first or has not authorized a commit.
- For a pull request, determine the base from the branch's parent in the branch/PR chain. In a stacked chain, target the immediate parent branch. Use an explicitly requested target when supplied; if the parent cannot be determined confidently, ask rather than defaulting to `main`.
- Summarize the complete branch relative to the selected base, including all commits and changes on the branch, not only work from the current session. Review the full branch diff before creating the PR.
- Create the pull request against that base and merge it into that same base once required checks and review conditions pass, unless the user specifies a different target or asks to leave it open.
