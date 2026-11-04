export function workGreetingFor(now: Date, projectName = ""): string {
  const hour = now.getHours();

  if (hour >= 5 && hour < 12) {
    return projectName
      ? `Good morning, let’s move ${projectName} forward`
      : "Good morning, ready to move your work forward?";
  }

  if (hour >= 12 && hour < 17) {
    return projectName
      ? `Good afternoon, what’s next for ${projectName}?`
      : "Good afternoon, what’s next for your projects?";
  }

  if (hour >= 17 && hour < 22) {
    return projectName
      ? `Good evening, let’s make progress on ${projectName}`
      : "Good evening, make room for meaningful work";
  }

  return projectName
    ? `A quiet night to focus on ${projectName}`
    : "A quiet night to focus on your next project";
}
