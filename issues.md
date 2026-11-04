# Known Issues

Observed on 2026-11-04 while preparing the delegation browser run.

## Server typecheck

`npm test` in `server/` currently stops during TypeScript checking at `server/src/chats/chats.ts:506`: `Buffer<ArrayBufferLike>` is not assignable to `BodyInit`.

The test TypeScript project also reports `server/tests/preferences/preferences-flow.test.ts:149` because its `UserPreferences` fixture is missing `hideThinkingByDefault`.

## Server test suite

Running `node --import tsx --test 'tests/**/*.test.ts'` directly produced 146 passing and 11 failing tests:

- Seven chat, integrations, skills, memory-session, and project-session tests received HTTP 502 where they expected 201 from Muse session startup.
- Two memory helper tests expect older validation/context wording than the current implementation.
- The preferences flow test does not expect the current `hideThinkingByDefault` field.
- The transcription flow test could not start because port 31992 was already in use.

The focused team-turn, team-context, Git-helper, and web test suites passed during the delegation fix work. Re-run this list after the environment and expected fixtures are updated.
