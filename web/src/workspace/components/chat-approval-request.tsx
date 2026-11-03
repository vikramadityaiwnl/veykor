import { useState } from "react";
import type { ChatApproval } from "@veykor/shared";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { chatAction } from "../chat-runtime-store";
import { approvalDetails, approvalScope } from "../approval-details";

interface Props {
  sessionId: string;
  approval: ChatApproval;
}

export function ChatApprovalRequest(props: Props) {
  const [pendingChoice, setPendingChoice] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function decide(choiceId: string) {
    if (pendingChoice) {
      return;
    }

    setPendingChoice(choiceId);
    setError("");

    try {
      await chatAction(props.sessionId, "approval", {
        approvalId: props.approval.id,
        choiceId,
      });
      setSubmitted(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to submit decision. Try again.",
      );
    } finally {
      setPendingChoice("");
    }
  }

  if (submitted) {
    return null;
  }

  return (
    <VStack
      gap={3}
      padding={4}
      className="min-w-0 rounded-(--radius-md) border border-solid border-(--color-border-emphasized) bg-(--color-background-surface)"
    >
      <VStack gap={1}>
        <Text weight="semibold">
          Approval needed · {props.approval.toolName}
        </Text>
        <Text type="supporting">
          Review the command or access below. The agent is waiting for your
          decision.
        </Text>
      </VStack>

      <VStack
        gap={3}
        className="min-h-0 max-h-[25vh] overflow-auto"
        tabIndex={0}
        aria-label="Requested command and access"
      >
        {approvalDetails(props.approval.arguments).map((detail) => (
          <VStack key={detail.label} gap={1} className="min-w-0">
            <Text type="label" className="capitalize">
              {detail.label}
            </Text>
            <Text
              type="code"
              as="p"
              className="rounded-(--radius-sm) bg-(--color-background-raised) p-3 whitespace-pre-wrap wrap-anywhere"
            >
              {detail.value || "No additional details provided"}
            </Text>
          </VStack>
        ))}
      </VStack>

      <HStack gap={3} wrap="wrap" className="items-start">
        {props.approval.choices.map((choice) => (
          <VStack
            key={choice.choiceId}
            gap={1}
            className="min-w-0 flex-1 basis-32"
          >
            <Button
              label={
                pendingChoice === choice.choiceId ? "Submitting…" : choice.label
              }
              variant="secondary"
              isDisabled={!!pendingChoice}
              clickAction={() => {
                void decide(choice.choiceId);
              }}
            />
            <Text
              type="supporting"
              className="whitespace-pre-wrap wrap-anywhere"
            >
              {approvalScope(choice.scope)}
              {choice.rulePreview ? `\n${choice.rulePreview}` : ""}
            </Text>
          </VStack>
        ))}
      </HStack>

      <VStack gap={1} role="status" aria-live="polite">
        {pendingChoice && (
          <Text type="supporting">
            Sending your decision. Waiting for confirmation…
          </Text>
        )}
        {error && (
          <Banner
            status="error"
            title="Decision was not confirmed"
            description={error}
          />
        )}
      </VStack>
    </VStack>
  );
}
