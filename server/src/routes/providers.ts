import { execFileSync } from "node:child_process";
import { Hono } from "hono";
import type { CliStatusResponse, ProviderCliId, ProviderCliStatus } from "@veykor/shared";
import { requireAuth, type AuthEnv } from "../auth/auth.js";

const knownClis: {
  id: ProviderCliId;
  cli: string;
  label: string;
  company: string;
}[] = [
  { id: "muse", cli: "muse", label: "Muse Code", company: "Meta" },
  { id: "codex", cli: "codex", label: "Codex", company: "OpenAI" },
  { id: "claude", cli: "claude", label: "Claude", company: "Anthropic" },
  { id: "opencode", cli: "opencode", label: "OpenCode", company: "SST" },
  { id: "aider", cli: "aider", label: "Aider", company: "Aider" },
];

function isInstalled(cli: string): boolean {
  try {
    execFileSync("sh", ["-c", `command -v ${cli}`], { stdio: "ignore" });

    return true;
  } catch {
    return false;
  }
}

function cliVersion(cli: string): string {
  try {
    const output = execFileSync(cli, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });

    return output.split("\n")[0].trim().slice(0, 120);
  } catch {
    return "";
  }
}

function detectCli(entry: {
  id: ProviderCliId;
  cli: string;
  label: string;
  company: string;
}): ProviderCliStatus {
  const installed = isInstalled(entry.cli);

  return {
    id: entry.id,
    cli: entry.cli,
    label: entry.label,
    company: entry.company,
    installed,
    version: installed ? cliVersion(entry.cli) : "",
  };
}

export const providersRoute = new Hono<AuthEnv>();

providersRoute.use("*", requireAuth);

providersRoute.get("/cli-status", (c) => {
  const response: CliStatusResponse = {
    providers: knownClis.map(detectCli),
  };

  return c.json(response);
});
