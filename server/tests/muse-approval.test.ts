import { test } from "node:test";
import assert from "node:assert/strict";
import { MuseSession } from "../src/providers/muse/session.js";
import type { MuseEvent } from "../src/providers/muse/connection.js";
import type { ApprovalDecisionInput, ApprovalRequest } from "../src/providers/muse/types.js";

const approval: ApprovalRequest = {
  sessionId: "session",
  approvalId: "approval",
  currentRequirementId: { approvalId: "approval", sourceIndex: 0 },
  toolName: "shell",
  rawArgs: '{"command":"pwd"}',
  availableChoices: [{ choiceId: "once", label: "Allow once", scope: "once" }],
};

async function harness(
  onApproval: (request: ApprovalRequest) => Promise<ApprovalDecisionInput>,
) {
  const listeners = new Set<(event: MuseEvent) => void>();
  let pending: ApprovalRequest[] = [];
  let apply: () => Promise<object> = async () => ({});
  const session = await MuseSession.open(
    {
      connection: {
        command: async (method) =>
          method === "session/start"
            ? { session: { sessionId: "session" }, history: { items: [] } }
            : apply(),
        request: async () => ({ approvals: pending }),
        closed: new Promise<void>(() => {}),
      },
      onEvent: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    "session/start",
    { onApproval, onApprovalError: () => {} },
  );

  return {
    session,
    pending: (requests: ApprovalRequest[]) => {
      pending = requests;
    },
    apply: (handler: () => Promise<object>) => {
      apply = handler;
    },
    emit: (method: string, params: Record<string, unknown>) => {
      for (const listener of listeners) {
        listener({ method, params });
      }
    },
  };
}

test("pending approval reconciliation recovers missed and sparse notifications without duplicate requests", async () => {
  const received: string[] = [];
  const runtime = await harness(async (request) => {
    received.push(request.approvalId);
    return new Promise<ApprovalDecisionInput>(() => {});
  });
  runtime.pending([approval]);
  await runtime.session.syncApprovals(true);
  await runtime.session.syncApprovals(true);
  assert.deepEqual(received, ["approval"]);

  runtime.pending([{ ...approval, approvalId: "second" }]);
  runtime.emit("approval/updated", {
    sessionId: "session",
    approvalId: "second",
  });
  await runtime.session.syncApprovals(true);
  assert.deepEqual(received, ["approval", "second"]);
});

test("a permission decision is confirmed only after Muse accepts it", async () => {
  let confirm!: (value: object) => void;
  let applied = false;
  const runtime = await harness(async () => ({
    choiceId: "once",
    onApplied: () => {
      applied = true;
    },
  }));
  runtime.apply(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      }),
  );
  runtime.emit("approval/request", { ...approval });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(applied, false);
  confirm({});
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(applied, true);
});

test("a rejected permission decision reports the error and offers a fresh attempt", async () => {
  let calls = 0;
  let failure = "";
  const runtime = await harness(async () => {
    calls += 1;
    if (calls > 1) {
      return new Promise<ApprovalDecisionInput>(() => {});
    }
    return {
      choiceId: "once",
      onError: (error) => {
        failure = error.message;
      },
    };
  });
  runtime.apply(async () => {
    throw new Error("Permission expired");
  });
  runtime.emit("approval/request", { ...approval });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(failure, "Permission expired");
  assert.equal(calls, 2);
});
