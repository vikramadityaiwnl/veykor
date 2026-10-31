import { Text } from "@astryxdesign/core/Text";

export function ThinkingMessage() {
  return (
    <Text
      type="supporting"
      className="chat-thinking"
      role="status"
      aria-live="polite"
    >
      Thinking…
    </Text>
  );
}
