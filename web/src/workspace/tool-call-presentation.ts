function object(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function formatted(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function toolCallPresentation(target: string, result: string) {
  const args = object(target);
  const response = object(result);
  const primaryKey =
    ["command", "cmd", "file_path", "path", "query", "url"].find(
      (key) => typeof args[key] === "string",
    ) || "";
  const labels: Record<string, string> = {
    command: "Command",
    cmd: "Command",
    file_path: "File",
    path: "File",
    query: "Search",
    url: "URL",
  };
  const extra = Object.fromEntries(
    Object.entries(args).filter(
      ([key]) => key !== primaryKey && key !== "description",
    ),
  );
  const content = Array.isArray(response.content)
    ? response.content
        .filter((part) => part && part.type === "text")
        .map((part) => part.text)
        .join("\n")
    : "";
  const output =
    typeof response.output === "string"
      ? response.output
      : content ||
        (Object.keys(response).length ? formatted(response) : result);

  return {
    title: labels[primaryKey] || "Parameters",
    primary: primaryKey
      ? String(args[primaryKey])
      : Object.keys(args).length
        ? formatted(args)
        : target,
    description: typeof args.description === "string" ? args.description : "",
    extra: primaryKey && Object.keys(extra).length ? formatted(extra) : "",
    output,
    exitCode:
      typeof response.exit_code === "number"
        ? `Exit code ${response.exit_code}`
        : "",
  };
}
