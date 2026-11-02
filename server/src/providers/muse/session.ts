import type { ChatReasoningEffort } from "@veykor/shared";
import type { ApprovalDecisionInput, ApprovalRequest, FoldedItem } from "./types.js";
import type { MuseEvent } from "./connection.js";

interface Transport {
  connection: {
    command: (method: string, params: object) => Promise<any>;
    request: (method: string, params: object) => Promise<any>;
    closed: Promise<void>;
  };
  onEvent: (handler: (event: MuseEvent) => void) => () => void;
}

type ApprovalHandler = (
  request: ApprovalRequest,
) => Promise<ApprovalDecisionInput>;
type ApprovalErrorHandler = (failure: { kind: string }) => void;

export class MuseSession {
  readonly sessionId: string;
  private itemStore = new Map<string, FoldedItem>();
  private fields = new Map<string, Map<string, string>>();
  private active = "";
  private outcomes = new Map<string, any>();
  private waiters = new Map<
    string,
    { resolve: (outcome: any) => void; reject: (error: Error) => void }
  >();
  private approvalHandler?: ApprovalHandler;
  private approvalErrorHandler?: ApprovalErrorHandler;
  private requirements = new Map<string, string>();

  readonly items = {
    list: () => [...this.itemStore.values()],
    accumulated: (id: string, field = "text") =>
      this.fields.get(id)?.get(field),
    accumulatedFields: (id: string) => [...(this.fields.get(id)?.keys() || [])],
  };

  get activeTurnId(): string {
    return this.active;
  }

  private constructor(
    private transport: Transport,
    snapshot: any,
    options: Record<string, unknown>,
  ) {
    this.sessionId = snapshot.session.sessionId;
    this.active = snapshot.session.turnId || "";
    this.approvalHandler = options.onApproval as ApprovalHandler | undefined;
    this.approvalErrorHandler = options.onApprovalError as
      ApprovalErrorHandler | undefined;

    for (const item of snapshot.history?.items || []) {
      this.itemStore.set(item.itemId, item);
    }

    const remove = transport.onEvent((event) => {
      this.receive(event);
    });
    void transport.connection.closed.then(() => {
      remove();

      for (const waiter of this.waiters.values()) {
        waiter.reject(
          new Error(
            "Muse disconnected during execution. Reopen the session to recover history.",
          ),
        );
      }

      this.waiters.clear();
    });
  }

  static async open(
    transport: Transport,
    method: string,
    options: Record<string, unknown>,
  ): Promise<MuseSession> {
    const {
      onApproval: _onApproval,
      onApprovalError: _onApprovalError,
      ...params
    } = options;
    const buffered: MuseEvent[] = [];
    const remove = transport.onEvent((event) => {
      buffered.push(event);
    });

    try {
      const snapshot = await transport.connection.command(
        method,
        method === "session/resume"
          ? { ...params, excludeItems: false }
          : params,
      );
      const session = new MuseSession(transport, snapshot, options);
      remove();

      for (const event of buffered) {
        session.receive(event);
      }

      const approvals = await transport.connection.request(
        "approval/listPending",
        { sessionId: session.sessionId },
      );

      for (const request of approvals.approvals || []) {
        session.approve(request);
      }

      return session;
    } finally {
      remove();
    }
  }

  onApproval(handler: ApprovalHandler) {
    this.approvalHandler = handler;
  }

  onApprovalError(handler: ApprovalErrorHandler) {
    this.approvalErrorHandler = handler;
  }

  private approve(request: ApprovalRequest) {
    const key = JSON.stringify(request.currentRequirementId);

    if (
      !this.approvalHandler ||
      this.requirements.get(request.approvalId) === key
    ) {
      return;
    }

    this.requirements.set(request.approvalId, key);
    void this.approvalHandler(request)
      .then(async (decision) => {
        if (this.requirements.get(request.approvalId) !== key) {
          return;
        }

        await this.transport.connection.command("approval/decide", {
          sessionId: this.sessionId,
          approvalId: request.approvalId,
          requirementId: request.currentRequirementId,
          choiceId: decision.choiceId,
        });
      })
      .catch((error) => {
        this.requirements.delete(request.approvalId);
        this.approvalErrorHandler?.({
          kind: error instanceof Error ? error.message : "Approval failed",
        });
        this.approve(request);
      });
  }

  private receive(event: MuseEvent) {
    const p = event.params as any;

    if (!p || p.sessionId !== this.sessionId) {
      return;
    }

    if (
      event.method === "approval/request" ||
      event.method === "approval/requested" ||
      event.method === "approval/updated"
    ) {
      if (p.availableChoices && p.currentRequirementId) {
        this.approve(p);
      }
    } else if (event.method === "approval/resolved") {
      this.requirements.delete(p.approvalId);
    } else if (
      event.method === "item/started" ||
      event.method === "item/updated" ||
      event.method === "item/completed"
    ) {
      const item = p.item as FoldedItem;
      const previous = this.itemStore.get(item.itemId);

      if (!previous || (item.revision || 0) >= (previous.revision || 0)) {
        this.itemStore.set(item.itemId, item);

        if (item.status !== "inProgress") {
          this.fields.delete(item.itemId);
        }
      }
    } else if (event.method === "item/delta") {
      const fields = this.fields.get(p.itemId) || new Map<string, string>();
      const field = p.field || "text";
      const item = this.itemStore.get(p.itemId);
      const summary = /^summary\.(\d+)$/.exec(field);
      const initial =
        field === "text"
          ? item?.text || ""
          : summary
            ? item?.summary?.[Number(summary[1])] || ""
            : "";
      fields.set(field, (fields.get(field) ?? initial) + p.delta);
      this.fields.set(p.itemId, fields);
    } else if (event.method === "turn/started") {
      this.active = p.turnId;
    } else if (event.method === "turn/completed") {
      this.active = "";
      const outcome = { kind: "completed", params: p };
      const waiter = this.waiters.get(p.turnId);

      if (waiter) {
        this.waiters.delete(p.turnId);
        waiter.resolve(outcome);
      } else {
        this.outcomes.set(p.turnId, outcome);
      }
    } else if (event.method === "turn/retracted") {
      this.active = "";
      const outcome = { kind: "retracted", params: p };
      const waiter = this.waiters.get(p.turnId);

      if (waiter) {
        this.waiters.delete(p.turnId);
        waiter.resolve(outcome);
      } else {
        this.outcomes.set(p.turnId, outcome);
      }

      for (const item of this.itemStore.values()) {
        if (item.turnId === p.turnId) {
          item.retracted = true;
        }
      }
    } else if (event.method === "view/gap") {
      void this.refresh().catch((error) => {
        for (const waiter of this.waiters.values()) {
          waiter.reject(error);
        }
        this.waiters.clear();
      });
    }
  }

  async refresh() {
    const snapshot = await this.transport.connection.request("session/read", {
      sessionId: this.sessionId,
      excludeItems: false,
    });
    this.itemStore.clear();
    this.fields.clear();

    for (const item of snapshot.history?.items || []) {
      this.itemStore.set(item.itemId, item);
    }
  }

  async sendUserTurn(options: {
    input: object[];
    reasoningEffort: ChatReasoningEffort;
    composerInput: string;
    submissionId?: string;
  }) {
    const result = await this.transport.connection.command("turn/start", {
      sessionId: this.sessionId,
      input: options.input,
      reasoningEffort: options.reasoningEffort,
      displayText: options.composerInput,
      ifBusy: "queue",
      ...(options.submissionId ? { commandId: options.submissionId } : {}),
    });
    const turnId = result.turnId as string;
    const completed = this.outcomes.has(turnId)
      ? Promise.resolve(this.outcomes.get(turnId))
      : new Promise<any>((resolve, reject) => {
          this.waiters.set(turnId, { resolve, reject });
        });
    this.outcomes.delete(turnId);

    return { turnId, completed };
  }
}
