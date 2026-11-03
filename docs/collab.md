# Agent collaboration

The user talks to a lead agent in one main project chat. The lead delegates
work to other project agents through collaboration tools. Delegates work in
internal sessions linked to the main chat. Results, questions, and lifecycle
events flow back automatically.

## Model

- An agent is a reusable configuration. A session is one conversation.
- The main project chat is the parent session and stays the lead.
- Each participating delegate gets one internal session per main chat,
  reused across its tasks. Internal sessions never appear in the sidebar,
  chat lists, search, or recent chats.
- Only the lead delegates in v1. Delegates cannot spawn further agents.
- Collaboration stays within one account and one project.
- Each session keeps its own agent snapshot, provider, model,
  instructions, tools, MCP configuration, and permissions.

## Data

Tables: `collab_participants`, `collab_tasks`, `collab_events`,
`collab_deliveries`, `collab_messages`. Internal sessions reuse the
`conversations` row with `parentConversationId` set.

Task states: `queued`, `running`, `waiting-for-approval`,
`waiting-for-reply`, `completed`, `interrupted`, `failed`, `blocked`.
Task state is independent of native turn state: a finished turn does not
complete a task; only `veykor_report_result` (or a terminal transition)
does. `blocked` means a dependency failed or stopped.

Deleting a main chat deletes its internal sessions and collaboration rows.
Project files are untouched.

## Shared awareness

`collab_events` is the ordered stream scoped to the main chat. Fan-out
writes one `collab_deliveries` row per recipient session. Delivery states:

- `queued`: persisted and addressed, not yet in native context.
- `delivered`: included in dispatched native input (confirmed by provider
  acceptance) or handed to the recipient directly.
- `acked`: read back through `veykor_read_events` or a briefing.

The queue attaches pending events as a digest to the next dispatched
native turn for that session and confirms delivery only after the provider
accepts the turn. Informational events never start a turn by themselves;
they piggyback on turns that already happen. Response-required events
(results, interruption outcomes, failures, direct questions and answers)
wake idle recipients with a follow-up turn. Busy recipients pick events up
at the next turn boundary. Mid-turn injection is not used: providers that
support steering keep it for explicit user steering only.

Late joiners get a briefing (compact task states plus recent events) on
their first dispatch instead of a replayed backlog.

## Tools

Muse sessions in project chats get a session-scoped `veykor-collab` MCP
server over stdio. It runs with only `DATABASE_URL`, `PATH`, and the
`VEYKOR_USER_ID` / `VEYKOR_CONVERSATION_ID` identity; no application
credentials. Identity comes from that environment, never from
model-supplied fields. The bridge is DB-only: dispatch, provider stops,
and confirmations run in the main server process.

Tools: `veykor_list_agents`, `veykor_list_collab`, `veykor_delegate`,
`veykor_send_message`, `veykor_read_events`, `veykor_report_progress`,
`veykor_report_result`, `veykor_request_interruption`.

Agent tool restrictions still apply: a restricted agent that does not
allow `veykor_*` tools cannot collaborate, and the denial surfaces as a
tool error rather than silent broadening.

OpenCode cannot attach per-session MCP servers, so OpenCode agents cannot
receive collaboration tools in v1. Delegating to an OpenCode agent fails
with an explicit limitation. The lead keeps working; results still arrive
as native messages for delegations created through the API.

## Delegation and results

`veykor_delegate` validates ownership, creates (or reuses) the delegate
session, records the task, and returns immediately. A sweeper dispatches
ready tasks in dependency order: a task with unmet `dependsOn` waits, and
stays `blocked` when a dependency fails or stops.

The delegate prompt carries the task, expected outcome, explicit context,
and reporting instructions. The parent transcript is never copied.

When the delegate reports, the result event wakes the lead through the
durable queue, so the user never forwards results by hand. Report-less
turns get one reminder before the task fails honestly.

## Stopping

Every stop path uses one idempotent backend operation: delegate Stop
control, delegate-composer `stop`, main-composer `stop <exact name>`,
participant Stop control, and `veykor_request_interruption`.

Queued work cancels before dispatch. Running work gets a provider
interrupt, then confirmation polling. The timeline shows `Stopping …`
until the outcome is known, then stopped, failed, or uncertain with
retry. Partial work stays in the delegate transcript and is marked
explicitly incomplete. Stopping one delegate never stops the lead or
other delegates. Stopping the lead stops only its own turn.

## Limits

Centralized in `server/src/collab/limits.ts`: 5 delegates, 50 tasks,
500 events per chat, bounded instruction/message/result sizes, one
report reminder, 8s interrupt confirmation window per sweep cycle.
