import { spawnMspConnection } from "@muse-code/sdk";
import type { Connection } from "@muse-code/sdk";

export interface MuseNotification {
  method: string;
  params: Record<string, unknown>;
}

type Subscriber = (notification: MuseNotification) => void;

export function museBinary(): string {
  const override = process.env["MUSE_BIN"];

  if (override !== undefined && override.trim() !== "") {
    return override.trim();
  }

  return "muse";
}

class MuseHost {
  private ready: Promise<Connection> | null = null;
  private granted: Array<string> = [];
  private subscribers = new Map<string, Set<Subscriber>>();

  private notify(notification: MuseNotification): void {
    const sessionId = notification.params["sessionId"];

    if (typeof sessionId !== "string") {
      return;
    }

    const listeners = this.subscribers.get(sessionId);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(notification);
    }
  }

  private async spawn(): Promise<Connection> {
    const handshake = spawnMspConnection({
      command: museBinary(),
      args: ["serve", "--trust-workspace"],
      cwd: process.cwd(),
      env: process.env,
      onStderr: () => {},
    });

    let connection: Connection;

    try {
      const msp = await handshake.initialize({
        clientInfo: { name: "veykor_server", version: "0.0.0" },
        capabilities: { requestedCapabilities: ["sessionMcp"] },
      });

      this.granted = [...msp.initializeResult.grantedCapabilities];

      connection = msp.connection;
    } catch (cause) {
      this.ready = null;
      throw cause;
    }

    connection.onNotification((notification) => {
      this.notify({
        method: notification.method,
        params: (notification.params ?? {}) as Record<string, unknown>,
      });
    });

    connection.onServerRequest(async (request) => {
      if (
        request.method === "approval/request" ||
        request.method === "userInput/request"
      ) {
        this.notify({
          method:
            request.method === "approval/request"
              ? "approval/requested"
              : "userInput/requested",
          params: (request.params ?? {}) as Record<string, unknown>,
        });

        return {};
      }

      throw Object.assign(new Error(`method not found: ${request.method}`), {
        code: -32601,
      });
    });

    void connection.closed.then(() => {
      this.ready = null;
      this.granted = [];
    });

    return connection;
  }

  async connection(): Promise<Connection> {
    if (!this.ready) {
      this.ready = this.spawn();
    }

    return this.ready;
  }

  async supportsSessionMcp(): Promise<boolean> {
    await this.connection();

    return this.granted.includes("sessionMcp");
  }

  subscribe(sessionId: string, listener: Subscriber): () => void {
    let listeners = this.subscribers.get(sessionId);

    if (!listeners) {
      listeners = new Set();
      this.subscribers.set(sessionId, listeners);
    }

    listeners.add(listener);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0) {
        this.subscribers.delete(sessionId);
      }
    };
  }
}

export const museHost = new MuseHost();
