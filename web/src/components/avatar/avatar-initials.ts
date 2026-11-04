export function avatarInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (word) =>
        Array.from(word).find((char) => /[\p{L}\p{N}]/u.test(char)) ?? "",
    )
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase();

  return initials || "?";
}
