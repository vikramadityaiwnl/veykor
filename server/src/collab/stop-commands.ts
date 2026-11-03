export interface StopCandidate {
  conversationId: string;
  agentName: string;
}

export type StopParse =
  | { action: "message" }
  | { action: "stop"; conversationId: string; agentName: string }
  | { action: "ask"; candidates: string[] };

const stopVerbs = ["stop", "cancel", "abort"];

const negation =
  /\b(don't|dont|do not|never|not|until|unless|keep|continue)\b/i;

function normalize(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
}

export function parseDelegateStopCommand(
  text: string,
  self: StopCandidate,
  others: StopCandidate[],
): StopParse {
  const clean = normalize(text);

  if (!clean || negation.test(clean)) {
    return { action: "message" };
  }

  const [verb, ...rest] = clean.split(" ");

  if (!verb || !stopVerbs.includes(verb.toLowerCase())) {
    return { action: "message" };
  }

  if (rest.length === 0) {
    return {
      action: "stop",
      conversationId: self.conversationId,
      agentName: self.agentName,
    };
  }

  if (rest.length > 2) {
    return { action: "message" };
  }

  const target = rest.join(" ").toLowerCase();

  if (target === self.agentName.toLowerCase()) {
    return {
      action: "stop",
      conversationId: self.conversationId,
      agentName: self.agentName,
    };
  }

  if (
    others.some((entry) => entry.agentName.toLowerCase() === target) ||
    target === "lead"
  ) {
    return { action: "message" };
  }

  return {
    action: "stop",
    conversationId: self.conversationId,
    agentName: self.agentName,
  };
}

export function parseMainStopCommand(
  text: string,
  delegates: StopCandidate[],
): StopParse {
  const clean = normalize(text);

  if (!clean || negation.test(clean)) {
    return { action: "message" };
  }

  const [verb, ...rest] = clean.split(" ");

  if (!verb || !stopVerbs.includes(verb.toLowerCase())) {
    return { action: "message" };
  }

  if (rest.length === 0) {
    return {
      action: "ask",
      candidates: delegates.map((entry) => entry.agentName),
    };
  }

  const target = rest.join(" ").toLowerCase();
  const matches = delegates.filter(
    (entry) => entry.agentName.toLowerCase() === target,
  );

  if (matches.length === 1) {
    return {
      action: "stop",
      conversationId: matches[0].conversationId,
      agentName: matches[0].agentName,
    };
  }

  if (matches.length > 1) {
    return {
      action: "ask",
      candidates: matches.map((entry) => entry.agentName),
    };
  }

  return { action: "message" };
}
