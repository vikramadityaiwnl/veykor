import type { ChatSession } from "../chat-sessions-store";
import { VStack } from "@astryxdesign/core/VStack";
import { ChatApprovalRequest } from "./chat-approval-request";

interface Props {
  session: ChatSession;
}

export function ChatNativeActivity(props: Props) {
  const approvals = props.session.approvals || [];

  if (!approvals.length) {
    return null;
  }

  return (
    <VStack
      gap={3}
      className="mx-auto mb-3 max-h-[50vh] w-full max-w-4xl overflow-auto"
      aria-label="Agent approvals"
    >
      {approvals.map((approval) => (
        <ChatApprovalRequest
          key={JSON.stringify([
            approval.id,
            approval.arguments,
            approval.choices,
          ])}
          sessionId={props.session.id}
          approval={approval}
        />
      ))}
    </VStack>
  );
}
