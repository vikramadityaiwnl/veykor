# veykor

**An Agent Development Environment (ADE) built around collaboration, autonomy, and human control.**

## What is veykor?

veykor is an open-source, AI-native development environment where developers work alongside specialized AI agents as a team.

Instead of relying on a single AI assistant, veykor brings together multiple agents that can collaborate, delegate tasks, write code, review changes, test applications, and learn from experience.

The goal is to create an environment where AI agents can work independently while developers remain involved, informed, and in control.

## Why veykor?

The idea came from exploring AI coding tools and imagining how software development could evolve beyond a single developer interacting with a single AI assistant.

Software development is a collaborative process. It involves planning, implementation, reviews, testing, experimentation, and continuous improvement.

What if AI agents could work together like a development team, sharing responsibilities, communicating with each other, and improving from previous mistakes?

And what if developers could interact directly with any agent, intervene whenever necessary, and maintain complete visibility into their work?

These questions inspired veykor.

## The Meaning Behind the Name

**veykor** is a coined name, not a word with an established dictionary meaning.

It was chosen for its distinctive, strong, and modern sound, reflecting the identity of a new kind of development environment.

The name is intentionally not tied to any particular AI model, technology, or feature, allowing veykor to evolve beyond its original concept.

## Our Philosophy

**Autonomy without losing accountability.**

veykor is built on the belief that AI should empower developers, not replace their judgment.

The vision is simple: a development environment where humans and AI agents collaborate naturally, learn together, and build better software.

## Run veykor locally

### Prerequisites

- Node.js and npm
- Git

### Setup

1. Clone the repository and enter the project directory:

   ```sh
   git clone https://github.com/vikramadityaiwnl/veykor.git
   cd veykor
   ```

2. Install the root tools and each workspace's dependencies:

   ```sh
   npm install
   npm run install:all
   ```

3. Start the web app and API server together:

   ```sh
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173). The web app proxies `/api` requests to the server at `http://localhost:3001`. The server applies database migrations on startup and creates its local SQLite database at `server/data/veykor.db`.

### Useful commands

```sh
npm run dev:web       # Run only the web app
npm run dev:server    # Run only the API server
npm run build         # Typecheck shared contracts and build web and server
```

The server currently exposes `GET /api/health`, `GET /api/visits`, and `POST /api/visits`.
