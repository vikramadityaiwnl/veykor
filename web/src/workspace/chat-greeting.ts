export function chatGreeting(date: Date): string {
  const hour = date.getHours();
  const greeting =
    hour < 5
      ? "Still up?"
      : hour < 12
        ? "Good morning."
        : hour < 17
          ? "Good afternoon."
          : "Good evening.";
  const prompts = [
    "What’s on your mind?",
    "What shall we explore?",
    "Where should we begin?",
  ];

  return `${greeting} ${prompts[date.getMinutes() % prompts.length]}`;
}
