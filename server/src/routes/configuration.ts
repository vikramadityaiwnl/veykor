import { Hono } from "hono";
import { asc } from "drizzle-orm";
import type { ConfigurationUsersResponse } from "@veykor/shared";
import { isHostRequest } from "../auth/host-access.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

export const configurationRoute = new Hono();

configurationRoute.use("*", async (c, next) => {
  if (!isHostRequest(c)) {
    return c.json(
      {
        error:
          "Configuration is available only on the server host through localhost.",
      },
      403,
    );
  }

  await next();
});

configurationRoute.get("/users", (c) => {
  const result: ConfigurationUsersResponse = {
    users: db
      .select({ id: users.id, username: users.username, photo: users.photo })
      .from(users)
      .orderBy(asc(users.username), asc(users.id))
      .all(),
  };

  return c.json(result);
});
