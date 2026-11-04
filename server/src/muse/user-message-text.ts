import { questionTurnReminder } from "@veykor/shared";
import { readTeamMessage } from "../teams/team-messages.js";

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
  {
    prefix: '<veykor-team-message version="1">',
    suffix: "</veykor-team-message>",
  },
];

function stripEnvelopes(text: string): string {
  let current = text;

  for (const wrapper of wrappers) {
    let start = current.indexOf(wrapper.prefix);

    while (start !== -1) {
      const end = current.indexOf(
        wrapper.suffix,
        start + wrapper.prefix.length,
      );

      current =
        end === -1
          ? current.slice(0, start)
          : current.slice(0, start) +
            current.slice(end + wrapper.suffix.length);

      start = current.indexOf(wrapper.prefix);
    }
  }

  return current;
}

export function userMessageText(rawText: string, displayText: unknown): string {
  const chosen = typeof displayText === "string" ? displayText : rawText;
  const stripped = stripEnvelopes(chosen)
    .split(questionTurnReminder)
    .join("")
    .trim();

  return readTeamMessage(stripped) ? "" : stripped;
}
