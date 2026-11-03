export function providerEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  for (const key of [
    "JWT_SECRET",
    "DATABASE_URL",
    "AUTH_ORIGINS",
    "AUTH_COOKIE_SECURE",
  ]) {
    delete env[key];
  }

  return env;
}
