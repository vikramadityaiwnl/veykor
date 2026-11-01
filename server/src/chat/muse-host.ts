import { MuseClient, spawnMspConnection, readSessionDurability, type NotificationHandler } from "@muse-code/sdk";

export async function spawnMuse(workspaceRoot: string) {
  const env = { ...process.env };
  for (const key of [
    "JWT_SECRET",
    "DATABASE_URL",
    "AUTH_ORIGINS",
    "AUTH_COOKIE_SECURE",
  ]) {
    delete env[key];
  }
  const handshake = spawnMspConnection({
    command: process.env.MUSE_BIN || "muse",
    args: ["serve"],
    cwd: workspaceRoot,
    env,
  });
  try {
    const host = await handshake.initialize({
      clientInfo: { name: "veykor", version: "0.0.0" },
      capabilities: { userInputDialogs: false },
    });
    let sdkNotification: NotificationHandler = () => {};
    const listeners = new Set<NotificationHandler>();
    host.connection.onNotification((notification) => {
      sdkNotification(notification);
      for (const listener of listeners) {
        listener(notification);
      }
    });
    const connection = new Proxy(host.connection, {
      get(target, property) {
        if (property === "onNotification") {
          return (handler: NotificationHandler) => {
            sdkNotification = handler;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const client = new MuseClient(connection, {
      durability: readSessionDurability(host.initializeResult),
    });
    return {
      host,
      client,
      connection,
      onEvent: (handler: NotificationHandler) => {
        listeners.add(handler);
      },
      close: () => host.close(),
    };
  } catch (error) {
    await handshake.close();
    throw error;
  }
}
