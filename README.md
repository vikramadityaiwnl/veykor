# veykor

**An Agent Development Environment (ADE) built around collaboration, autonomy, and human control.**

veykor is an open-source, AI-native development environment where developers work alongside specialized AI agents as a team. It brings collaboration, delegation, code reviews, and experimentation into a workspace where developers stay informed and in control.

## Run locally

### Prerequisites

- Node.js and npm
- Git

### Setup

1. Clone the repository:

   ```sh
   git clone https://github.com/vikramadityaiwnl/veykor.git
   cd veykor
   ```

2. Install dependencies:

   ```sh
   npm install
   npm run install:all
   ```

3. Create the server environment file and generate a signing secret:

   ```sh
   cp server/.env.example server/.env
   openssl rand -base64 48
   ```

   Set `JWT_SECRET` to the generated value in `server/.env` and configure all variables listed in the example.

4. Start the app:

   ```sh
   npm run dev
   ```

5. Open [http://localhost:5173](http://localhost:5173).

   To sign in from another device on the same network, open the Network URL printed by Vite. Sign-in accepts requests from the app’s own origin without listing each network address in configuration. Configuration and account creation are available only through localhost on the hosting computer.

### Commands

```sh
npm run dev --prefix web       # Start the frontend
npm run dev --prefix server    # Start the backend
npm run build         # Build the project
```

## Chat

Open a new-chat draft from any workspace screen. Drafts stay on `/` and do not appear in the sidebar or database until the first message is sent; saved conversations open at `/chat/:sessionId`. The sidebar brand returns to the home screen. New conversations start as “New Chat”; the header menu can rename or delete a conversation. Conversations and their provider/model choices are saved in SQLite per account.

Chat uses the hosting computer's installed, signed-in Muse, Claude, Codex, or OpenCode CLI. Select a provider and then a model in the flat composer. Muse supplies its live `model/list` catalog, and OpenCode supplies its installed model catalog, including context limits and prices when available. Claude uses its `sonnet`, `opus`, and `haiku` aliases; Codex reads its local model cache. The model picker contains the models reported by that provider; manual model IDs are not offered. The protected root layout loads `/api/settings` once per page load or sign-in into a shared Zustand settings store. Chat and Settings reuse this data; installed providers appear first, alphabetically within each group. Reloading any protected route refreshes detection and model catalogs.

A context progress bar is shown after the first message when the selected model reports a context limit, based on the last reply’s reported input and output token counts. Prices and raw token counts are not displayed.

The composer supports up to five text/code attachments, each under 20 KB, and stop controls. Files are included as text in the message. Requests are limited to 1 MB and 200 messages per conversation; saved history is also limited to 1 MB per account. CLI sign-in remains in the installed tool, and requests use its host account. This chat flow does not select a project directory for agent actions.

Backend checks:

```sh
npm run test --prefix server
npm run typecheck:tests --prefix server
node --import ./server/node_modules/tsx/dist/loader.mjs --test web/tests/settings-store.test.ts
npm run build
npm run format:check
```
