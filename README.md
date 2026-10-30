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

### Commands

```sh
npm run dev --prefix web       # Start the frontend
npm run dev --prefix server    # Start the backend
npm run build         # Build the project
```
