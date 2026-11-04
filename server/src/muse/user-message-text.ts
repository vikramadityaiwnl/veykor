import { questionTurnReminder } from "@veykor/shared";
import { readTeamMessage } from "../teams/team-messages.js";

export function userMessageText(rawText: string, displayText: unknown): string {
  let text = typeof displayText === "string" ? displayText : rawText;
  const wrappers = [
    {
      prefix: '<veykor-memory-context version="1">',
      suffix: "</veykor-memory-context>",
    },
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
      if (text.startsWith(questionTurnReminder)) {
        text = text.slice(questionTurnReminder.length).replace(/^\n+/, "");
        continue;
      }

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
