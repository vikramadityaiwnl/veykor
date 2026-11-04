import { readTeamMessage } from "../teams/team-messages.js";

export function userMessageText(rawText: string, displayText: unknown): string {
  if (typeof displayText === "string") {
    return readTeamMessage(displayText) ? "" : displayText;
  }

  let text = rawText;
  const wrappers = [
    {
      prefix: '<veykor-agent-context version="1">',
      suffix: "</veykor-agent-context>",
    },
    {
      prefix: '<veykor-team-context version="1">',
      suffix: "</veykor-team-context>",
    },
    {
      prefix: "<agent-instructions name=",
      suffix: "</agent-instructions>",
    },
  ];

  while (true) {
    const wrapper = wrappers.find((entry) => text.startsWith(entry.prefix));

    if (!wrapper) {
      break;
    }

    const end = text.indexOf(wrapper.suffix);

    if (end === -1) {
      return "";
    }

    text = text.slice(end + wrapper.suffix.length).replace(/^\n+/, "");
  }

  return readTeamMessage(text) ? "" : text;
}
