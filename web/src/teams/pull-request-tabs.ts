export function pullRequestTabId(number: number): string {
  return `pr:${number}`;
}

export function parsePullRequestTab(id: string): number {
  const match = id.match(/^pr:(\d+)$/);

  if (!match) {
    return 0;
  }

  const number = Number.parseInt(match[1] ?? "", 10);

  return Number.isInteger(number) && number > 0 ? number : 0;
}
