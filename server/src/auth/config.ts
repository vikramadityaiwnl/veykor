function required(name: string): string {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(
      `Missing required environment variable: ${name}. See server/.env.example.`,
    );
  }

  return value;
}

const secret = required("JWT_SECRET");

if (secret.includes("REPLACE_WITH") || Buffer.byteLength(secret) < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes");
}

const cookieSecure = required("AUTH_COOKIE_SECURE");

if (!["true", "false"].includes(cookieSecure)) {
  throw new Error("AUTH_COOKIE_SECURE must be true or false");
}

const origins = required("AUTH_ORIGINS")
  .split(",")
  .map((value) => value.trim());

for (const origin of origins) {
  const url = new URL(origin);

  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
    throw new Error(
      "AUTH_ORIGINS must contain comma-separated exact HTTP(S) origins",
    );
  }

  if (cookieSecure === "true" && url.protocol !== "https:") {
    throw new Error("Secure cookies require HTTPS origins");
  }
}

export const databaseUrl = required("DATABASE_URL");

export const port = Number(required("PORT"));

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

const environment = required("NODE_ENV");

if (!["development", "test", "production"].includes(environment)) {
  throw new Error("Invalid NODE_ENV");
}

export const authConfig = {
  secret,
  secure: cookieSecure === "true",
  origins,
  lifetime: 60 * 60 * 24 * 7,
};

if (environment === "production" && !authConfig.secure) {
  throw new Error("Production requires AUTH_COOKIE_SECURE=true and HTTPS");
}
