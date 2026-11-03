export interface ServerConfig {
  port: number;
  databaseUrl: string;
}

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
