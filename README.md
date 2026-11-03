# veykor

**An Agent Development Environment (ADE) built around collaboration, autonomy, and human control.**

veykor is an open-source, AI-native development environment where developers work alongside specialized AI agents as a team. It brings collaboration, delegation, code reviews, and experimentation into a workspace where developers stay informed and in control.

## Run locally

### Prerequisites

- Node.js and npm
- Git
- At least one installed and configured coding CLI on the backend host: [Muse Code](https://dev.meta.ai/docs/muse-code) or [OpenCode v2](https://dev.opencode.ai/v2/docs/cli)

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
npm run build                 # Build the project
npm run test --prefix server   # Run backend tests
npm run test:native --prefix server # Run real Muse acceptance tests
npm run format                # Format files
npm run format:check          # Check formatting
```
