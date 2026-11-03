const morningTitles = [
  "Good morning, what are we building today?",
  "Morning! What is on your mind?",
  "Good morning from veykor, ready when you are",
  "Rise and shine, what shall we work on?",
  "A fresh morning for fresh ideas",
];

const afternoonTitles = [
  "Good afternoon, how can veykor help?",
  "Afternoon! What are we tackling next?",
  "Hope your day is going well, what is up?",
  "Good afternoon, ready for the next task?",
  "Let us make this afternoon count",
];

const eveningTitles = [
  "Good evening, what are we creating tonight?",
  "Evening! How can veykor help?",
  "Winding down or just getting started?",
  "Good evening, what is on your mind?",
  "Let us end the day on a high note",
];

const nightTitles = [
  "Up late? veykor is here to help",
  "Burning the midnight oil, I see",
  "Quiet hours are the best for building",
  "Still awake? Let us get something done",
  "Night owl mode, what are we working on?",
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
