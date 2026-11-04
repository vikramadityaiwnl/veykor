const morningTitles = [
  "Good morning, what is on your mind?",
  "Morning! What would you like to ask?",
  "Good morning from veykor, ready to chat",
  "Rise and shine, what are you curious about?",
  "A fresh morning for good questions",
];

const afternoonTitles = [
  "Good afternoon, how can veykor help?",
  "Afternoon! What is on your mind?",
  "Hope your day is going well, what is up?",
  "Good afternoon, what would you like to know?",
  "Ask away, veykor is listening",
];

const eveningTitles = [
  "Good evening, what are you wondering tonight?",
  "Evening! How can veykor help?",
  "Winding down or just getting started?",
  "Good evening, what is on your mind?",
  "Settle in, what shall we talk about?",
];

const nightTitles = [
  "Up late? veykor is here to chat",
  "Still up? What is on your mind?",
  "Night owl mode, what are you curious about?",
  "Cannot sleep? Let us talk it through",
  "Late night questions welcome here",
];

export function greetingTitlesFor(now: Date): Array<string> {
  const hour = now.getHours();

  if (hour >= 5 && hour < 12) {
    return [...morningTitles];
  }

  if (hour >= 12 && hour < 17) {
    return [...afternoonTitles];
  }

  if (hour >= 17 && hour < 22) {
    return [...eveningTitles];
  }

  return [...nightTitles];
}

export function randomGreeting(now?: Date): string {
  const titles = greetingTitlesFor(now ?? new Date());
  const index = Math.floor(Math.random() * titles.length);

  return titles[index] ?? "How can veykor help?";
}
