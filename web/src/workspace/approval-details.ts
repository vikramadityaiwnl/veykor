export function approvalDetails(argumentsText: string) {
  try {
    const value: unknown = JSON.parse(argumentsText);

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
    ) {
      return Object.entries(value).map(([key, value]) => ({
        label: key.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2"),
        value:
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
      }));
    }
  } catch {
    return [{ label: "Command / requested access", value: argumentsText }];
  }

  return [{ label: "Arguments / requested access", value: argumentsText }];
}

export function approvalScope(scope: string) {
  if (/persistent|always|rule/i.test(scope)) {
    return "Applies to matching future requests";
  }

  if (/session/i.test(scope)) {
    return "Applies to this session";
  }

  if (/turn/i.test(scope)) {
    return "Applies to this turn";
  }

  if (/once|request/i.test(scope)) {
    return "Applies to this request only";
  }

  return scope ? `Scope: ${scope}` : "";
}
