import type { ChatPermissionMode } from "@veykor/shared";

export function permissionRules(mode: ChatPermissionMode) {
  if (mode === "onRequest") {
    throw new Error(
      "OpenCode supports ask, deny, or full access. Choose Ask for approval instead of Approve for me.",
    );
  }

  const effect =
    mode === "allowAll" ? "allow" : mode === "denyUnmatched" ? "deny" : "ask";

  return [{ action: "*", resource: "*", effect }];
}
