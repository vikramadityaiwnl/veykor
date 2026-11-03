export function resolveDbPath(): string {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      "Missing required environment variable: DATABASE_URL. See server/.env.example.",
    );
  }

  return url;
}
