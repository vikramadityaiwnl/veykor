export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const units = [
    { value: Math.floor(total / 3600), label: "hour" },
    { value: Math.floor((total % 3600) / 60), label: "minute" },
    { value: total % 60, label: "second" },
  ];

  const parts = units
    .filter((unit) => unit.value > 0)
    .map((unit) => `${unit.value} ${unit.label}${unit.value === 1 ? "" : "s"}`);

  return parts.length > 0 ? parts.join(", ") : "0 seconds";
}
