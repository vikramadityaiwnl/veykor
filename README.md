# veykor

**An Agent Development Environment (ADE) built around collaboration, autonomy, and human control.**

veykor is an open-source, AI-native development environment where developers work alongside specialized AI agents as a team. It brings collaboration, delegation, code reviews, and experimentation into a workspace where developers stay informed and in control.

## Prerequisites

- Node.js 22 or later
- npm

## Setup

Install every workspace:

```sh
npm run install:all
```

The server reads its configuration from environment variables, loading
`server/.env` when it exists. `PORT` and `DATABASE_URL` are required, and
the server stops with a clear error when one is missing or invalid.
`MODEL_API_KEY` is required only for voice transcription and image
generation. Copy the example
file and adjust the values:

```sh
cp server/.env.example server/.env
```

| Variable        | Example            | Description                                                     |
| --------------- | ------------------ | --------------------------------------------------------------- |
| `PORT`          | `3001`             | TCP port the API listens on                                     |
| `DATABASE_URL`  | `./data/veykor.db` | Path to the local SQLite file                                   |
| `MODEL_API_KEY` | `sk-...`           | Meta Model API key for voice transcription and image generation |

Start the API from `server/`:

```sh
npm run dev
```

Start the web app from `web/` in another terminal:

```sh
npm run dev
```

Then open `http://localhost:5173`.

## Accounts

Accounts can only be created on the host machine. Open veykor in a browser on
that computer and use the Create account tab; the tab only appears on
localhost. Signing in works from any device on the same local network.

## Opening veykor from a phone

1. Connect the phone to the same Wi-Fi network as the host computer.
2. Find the host computer's LAN IP:
   - macOS: `ipconfig getifaddr en0`
   - Linux: `hostname -I`
   - Windows: `ipconfig` (look for the IPv4 address)
3. On the phone, open `http://<LAN-IP>:5173` and sign in with an account that
   was created on the host machine.

veykor is intended for local-network use only. Do not expose it to the
internet.

## Commands

| Command                    | Description                                 |
| -------------------------- | ------------------------------------------- |
| `npm run dev`              | Run the web app and the API together        |
| `npm run build`            | Typecheck shared, then build web and server |
| `npm run format`           | Format the repository with Prettier         |
| `npm test --prefix server` | Typecheck the server and run its test suite |
