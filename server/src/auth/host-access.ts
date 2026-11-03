import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];

const loopbackAddresses = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

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

  if (host && !loopbackHosts.includes(new URL("http://" + host).hostname)) {
    return false;
  }

  if (origin && !loopbackHosts.includes(new URL(origin).hostname)) {
    return false;
  }

  const address = getConnInfo(c).remote.address;

  return (
    loopbackHosts.includes(hostname) &&
    loopbackAddresses.includes(address ?? "")
  );
}
