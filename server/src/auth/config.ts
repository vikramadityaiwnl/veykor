import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ServerConfig {
  port: number;
  databaseUrl: string;
}

export function parseDotEnvLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();

  if (trimmed === "" || trimmed.startsWith("#")) {
    return undefined;
  }

  const separator = trimmed.indexOf("=");

  if (separator <= 0) {
    return undefined;
  }

  const name = trimmed.slice(0, separator).trim();
  const raw = trimmed.slice(separator + 1).trim();

  if (name === "") {
    return undefined;
  }

  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return [name, raw.slice(1, -1)];
  }

  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return [name, raw.slice(1, -1)];
  }

  return [name, raw];
}

export function loadDotEnvFile(directory?: string): void {
  let contents: string;

  try {
    contents = readFileSync(
      resolve(directory ?? process.cwd(), ".env"),
      "utf8",
    );
  } catch {
    return;
  }

  for (const line of contents.split("\n")) {
    const parsed = parseDotEnvLine(line);

    if (parsed === undefined) {
      continue;
    }

    const [name, value] = parsed;

    if (process.env[name] === undefined) {
      process.env[name] = value;
    }
  }
}

loadDotEnvFile();

export function requiredEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadPort(): number {
  const port = Number(requiredEnv("PORT"));

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

export function loadDatabaseUrl(): string {
  return requiredEnv("DATABASE_URL");
}

export function loadServerConfig(): ServerConfig {
  return {
    port: loadPort(),
    databaseUrl: loadDatabaseUrl(),
  };
}
