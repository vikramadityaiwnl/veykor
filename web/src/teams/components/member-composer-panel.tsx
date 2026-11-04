import type {
  ChatApprovalChoice,
  ChatApprovalRequest,
  DecideApprovalRequest,
  QuestionRequest,
  TeamMember,
} from "@veykor/shared";
import ApprovalCard from "../../chat/components/approval-card.tsx";
import ComposerActivityPanel from "../../chat/components/composer-activity-panel.tsx";
import QuestionPanel from "../../chat/components/question-panel.tsx";
import { decideApproval as decideApprovalRequest } from "../../chat/chat-client.ts";
import { useChatStore } from "../../chat/chat-store.ts";
import { visibleOrphanedQuestions } from "../../chat/question-drafts.ts";
import { useTeamStore } from "../team-store.ts";
import MemberQueue from "./member-queue.tsx";
import TeamTodos from "./team-todos.tsx";

interface Props {
  member: TeamMember;
  approvals: ChatApprovalRequest[];
  pendingQuestions: Array<QuestionRequest>;
  recentQuestions: Array<QuestionRequest>;
  onDecided: () => void;
  onQuestionsSettled: () => void;
  onSteerQueuedMessage: (id: string) => void;
  onEditQueuedMessage: (id: string) => void;
}

function MemberComposerPanel(props: Props) {
  const taskCount = useTeamStore((state) =>
    state.snapshot.members.reduce(
      (count, member) => count + member.todos.length,
      0,
    ),
  );

  const dismissed = useChatStore((state) => state.dismissedQuestions);

  async function decideMemberApproval(
    approval: ChatApprovalRequest,
    choice: ChatApprovalChoice,
    feedback?: string,
  ) {
    const req: DecideApprovalRequest = {
      approvalId: approval.approvalId,
      choiceId: choice.choiceId,
    };

    if (feedback !== undefined && feedback !== "") {
      req.feedback = feedback;
    }

    await decideApprovalRequest(props.member.id, req);
    props.onDecided();
  }

  const showApprovals = props.approvals.length > 0;
  const showQueue = props.member.queuedMessages.length > 0;
  const showTasks = taskCount > 0;
  const showQuestions =
    props.pendingQuestions.length > 0 ||
    visibleOrphanedQuestions(props.recentQuestions, dismissed).length > 0;

  const first = showApprovals
    ? "approvals"
    : showQuestions
      ? "questions"
      : showQueue
        ? "queue"
        : "tasks";
  const last = showTasks
    ? "tasks"
    : showQueue
      ? "queue"
      : showQuestions
        ? "questions"
        : "approvals";

  return (
    <>
      {showApprovals ? (
        <ComposerActivityPanel
          count={props.approvals.length}
          first={first === "approvals"}
          last={last === "approvals"}
          title="Needs your approval"
        >
          <div className="space-y-3">
            {props.approvals.map((approval) => (
              <ApprovalCard
                key={approval.approvalId}
                approval={approval}
                decide={(choice, feedback) =>
                  decideMemberApproval(approval, choice, feedback)
                }
                decideImmediately
              />
            ))}
          </div>
        </ComposerActivityPanel>
      ) : null}

      {showQuestions ? (
        <QuestionPanel
          first={first === "questions"}
          hideOrigin
          last={last === "questions"}
          onSettled={props.onQuestionsSettled}
          pending={props.pendingQuestions}
          recent={props.recentQuestions}
        />
      ) : null}

      {showQueue ? (
        <ComposerActivityPanel
          count={props.member.queuedMessages.length}
          first={first === "queue"}
          last={last === "queue"}
          title="Queued messages"
        >
          <MemberQueue
            member={props.member}
            onEdit={props.onEditQueuedMessage}
            onSteer={props.onSteerQueuedMessage}
          />
        </ComposerActivityPanel>
      ) : null}

      {showTasks ? (
        <ComposerActivityPanel
          count={taskCount}
          first={first === "tasks"}
          last={last === "tasks"}
          title="Team tasks"
        >
          <TeamTodos memberId={props.member.id} />
        </ComposerActivityPanel>
      ) : null}
    </>
  );
}

export default MemberComposerPanel;
