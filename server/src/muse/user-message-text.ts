export function userMessageText(rawText: string, displayText: unknown): string {
  if (typeof displayText === "string") {
    return displayText;
  }

  const wrappers = [
    {
      prefix: '<veykor-agent-context version="1">',
      suffix: "\n</veykor-agent-context>\n\n",
    },
    {
      prefix: "<agent-instructions name=",
      suffix: "\n</agent-instructions>\n\n",
    },
  ];

  for (const wrapper of wrappers) {
    if (!rawText.startsWith(wrapper.prefix)) {
      continue;
    }

    const end = rawText.indexOf(wrapper.suffix);

    return end === -1 ? "" : rawText.slice(end + wrapper.suffix.length);
  }

  return rawText;
}
