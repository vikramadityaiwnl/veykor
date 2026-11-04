import type { ChatApprovalRequest, TeamMember } from "@veykor/shared";
import ComposerActivityPanel from "../../chat/components/composer-activity-panel.tsx";
import { useTeamStore } from "../team-store.ts";
import MemberApproval from "./member-approval.tsx";
import MemberQueue from "./member-queue.tsx";
import TeamTodos from "./team-todos.tsx";

interface Props {
  member: TeamMember;
  approvals: ChatApprovalRequest[];
  onDecided: () => void;
}

function MemberComposerPanel(props: Props) {
  const taskCount = useTeamStore((state) =>
    state.snapshot.members.reduce(
      (count, member) => count + member.todos.length,
      0,
    ),
  );

  return (
    <ComposerActivityPanel
      approvalCount={props.approvals.length}
      queueCount={props.member.queuedMessages.length}
      taskCount={taskCount}
    >
      {props.approvals.map((approval) => (
        <div key={approval.approvalId} className="px-4 py-3">
          <MemberApproval
            chatId={props.member.id}
            approval={approval}
            onDecided={props.onDecided}
          />
        </div>
      ))}
      <MemberQueue member={props.member} />
      <TeamTodos memberId={props.member.id} />
    </ComposerActivityPanel>
  );
}

export default MemberComposerPanel;
