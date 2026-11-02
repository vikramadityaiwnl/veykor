import { useState } from "react";
import type { ChatSession } from "../chat-sessions-store";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { chatAction } from "../chat-runtime-store";

interface Props {
  session: ChatSession;
}

export function ChatNativeActivity(props: Props) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function decide(approvalId: string, choiceId: string) {
    setPending(true);
    setError("");
    try {
      await chatAction(props.session.id, "approval", { approvalId, choiceId });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Decision failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <VStack gap={3} className="mx-auto w-full max-w-4xl px-4 pt-4">
      {error && <Banner status="error" title={error} />}
      {(props.session.approvals || []).map((approval) => (
        <VStack
          key={approval.id}
          gap={3}
          padding={4}
          className="rounded-(--radius-md) border border-solid border-(--color-border-emphasized)"
        >
          <Text weight="semibold">
            Muse requests permission: {approval.toolName}
          </Text>
          <Text type="code" className="whitespace-pre-wrap wrap-anywhere">
            {approval.arguments}
          </Text>
          <HStack gap={2} wrap="wrap">
            {approval.choices.map((choice) => (
              <VStack key={choice.choiceId} gap={1}>
                <Button
                  label={choice.label}
                  size="sm"
                  variant="secondary"
                  isDisabled={pending}
                  clickAction={() => {
                    void decide(approval.id, choice.choiceId);
                  }}
                />
                <Text type="supporting" color="secondary">
                  {choice.rulePreview || choice.scope}
                </Text>
              </VStack>
            ))}
          </HStack>
        </VStack>
      ))}
    </VStack>
  );
}
