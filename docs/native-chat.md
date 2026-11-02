# Native Muse chat

Veykor owns conversation metadata, attachment metadata, and presentation; Muse owns messages, transcripts, tool history, and session state. Hono authenticates every route and checks conversation ownership and project membership. A conversation cannot select another user's project, change its workspace after creation, or supply a native session ID through the metadata API.

`NativeChatProvider` separates the application API from the Muse implementation. The only implementation is Muse Code, using `@muse-code/sdk` 1.4.14 with `muse serve` 1.4.14. `MUSE_BIN` can select an explicit installed binary; otherwise the backend uses `muse` on its PATH. The backend inherits Muse's existing sign-in and configuration. The other five provider entries are frontend placeholders and have no backend integration.

Each conversation gets a backend-owned native session in its authorized project folder, or an account-specific workspace under the database directory for general chats. The backend keeps the SDK connection independently of HTTP clients. SQLite stores only conversation metadata, attachment metadata, and the native session ID mapping; it holds no transcripts, tool events, or file bytes. Opening a conversation resumes its native session, reads its history snapshot, and projects history, tools, usage, approvals, and activity from that snapshot plus live fold events. Browsers receive authenticated SSE snapshots and reconnect without restarting execution. Uploaded bytes live only in temporary staged files served through authorized URLs, so snapshots never carry file payloads; Muse keeps attachment bytes durably in its own log for model context but exposes no API to read them back, so missing staged files degrade to a placeholder instead. Sending the next message after a backend restart uses `resumeSession` with the saved native ID. A legacy conversation without a native ID imports its transcript once on its first native turn and then drops it. An interrupted backend leaves an explicit recovery message instead of reporting an invented successful turn.

Muse runs its own tools, hooks, and execution loop. The composer selects one of Muse's four native approval modes: `promptUnmatched`, `onRequest`, `denyUnmatched`, or `allowAll`. Mode changes use `session/setApprovalMode`. Approval handlers surface Muse's offered choices; the selected `choiceId` goes back through the SDK, which handles requirement IDs and decision submission. The application never invents approval choices or applies permission rules itself. Stop uses `turn/interrupt`; the bridge also supports `turn/cancel`.

Native images are enabled only for verified Muse Spark and Muse Wonder model IDs. PDFs, spreadsheets, and text files become clearly named text input because MSP has no native document part. Empty or unsupported documents produce an explicit conversion error. Native input must fit the SDK's 10 MiB frame, and application attachments are limited to five files of 10 MB each. Video and audio are unavailable: although MSP exposes video uploads, a real test with the installed native model profile returned a placeholder saying video was omitted as unsupported. Direct Model API modality documentation alone is not treated as proof of native Muse capability.

No protocol events are retained; the UI projects messages, tool output, approval requests, and generic activity from the native history snapshot plus the live fold on every snapshot.

## Verification

`npm run test --prefix server` covers application authorization and state boundaries without a model dependency. `npm run test:native --prefix server` requires the installed, signed-in Muse CLI and makes real model calls. It creates a temporary database and project and verifies legacy transcript slimming and staging, streaming, usage, tool execution after approval, four permission modes, reconnect, interruption, cancellation, cold resumption with history direct from Muse, native image input, staged bytes across restart, and document text fallback. It does not substitute model responses.

The green PNG fixture is a generated solid-color test image. Native sessions created by acceptance tests remain in Muse's own session history; the test removes its temporary application database and project.

## Official references

- [Muse TypeScript SDK](https://github.com/meta-models/muse-code-sdk/blob/main/clients/sdk-ts/README.md)
- [Native approvals and modes](https://meta-models.github.io/muse-code-sdk/next/guides/msp-concepts/approvals/)
- [Session durability](https://meta-models.github.io/muse-code-sdk/next/guides/msp-concepts/durability-profiles/)
