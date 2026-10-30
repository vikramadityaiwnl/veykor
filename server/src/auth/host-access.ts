import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

export function isHostRequest(c: Context): boolean {
  if (
    c.req.header("Forwarded") ||
    c.req.header("X-Forwarded-For") ||
    c.req.header("X-Forwarded-Host") ||
    c.req.header("Sec-Fetch-Site") === "cross-site"
  ) {
    return false;
  }

  const hostname = new URL(c.req.url).hostname;
  const origin = c.req.header("Origin");
  const host = c.req.header("Host");

  if (
    host &&
    !["localhost", "127.0.0.1", "[::1]"].includes(
      new URL("http://" + host).hostname,
    )
  ) {
    return false;
  }

  if (
    origin &&
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)
  ) {
    return false;
  }

  const address = getConnInfo(c).remote.address;

  return (
    ["localhost", "127.0.0.1", "[::1]"].includes(hostname) &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address ?? "")
  );
}
