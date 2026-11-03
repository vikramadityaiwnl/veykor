const loaderNames = [
  "Warming up the models",
  "Reconnecting your session",
  "Gathering context",
  "Reading the room",
  "Sharpening pencils",
  "Consulting the experts",
  "Brewing a fresh answer",
  "Connecting the dots",
  "Polishing the details",
  "Thinking it through",
];

export function randomLoaderName(): string {
  const index = Math.floor(Math.random() * loaderNames.length);

  return loaderNames[index] ?? "Thinking it through";
}
