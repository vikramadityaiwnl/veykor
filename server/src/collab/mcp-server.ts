import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { appendFileSync, statSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { readConversation } from "../chat/conversations.js";
import { listAgentsForProject } from "../agents/store.js";
import { listParticipants, listTasks, readTask } from "./store.js";
import { agentNameFor } from "./sessions.js";
import { currentStateSummary, delegateTask, describeTaskState, reportProgress, reportResult, sendCollabMessage } from "./tasks.js";
import { markReadThrough, unreadSince } from "./events.js";
import { requestInterruption } from "./interruption.js";

const userId = Number(process.env.VEYKOR_USER_ID || "0");
const conversationId = process.env.VEYKOR_CONVERSATION_ID || "";

try {
  const logPath = `${process.env.HOME || "/tmp"}/.veykor-collab-mcp.log`;
  const size = (() => {
    try {
      return statSync(logPath).size;
    } catch {
      return 0;
    }
  })();

  if (size > 100_000) {
    writeFileSync(logPath, "");
  }

  appendFileSync(
    logPath,
    `${new Date().toISOString()} spawn user=${userId} conversation=${conversationId} db=${process.env.DATABASE_URL} cwd=${process.cwd()}\n`,
  );
} catch {
  // Logging never breaks the bridge.
}

if (!Number.isSafeInteger(userId) || userId <= 0 || !conversationId) {
  console.error(
    "veykor-collab MCP server needs VEYKOR_USER_ID and VEYKOR_CONVERSATION_ID",
  );
  process.exit(1);
}

const metadata = readConversation(userId, conversationId);

if (!metadata?.projectId) {
  console.error("Collaboration tools need a project chat");
  process.exit(1);
}

const parentId = metadata.parentConversationId || metadata.id;
const projectId = metadata.projectId;
const callerName = agentNameFor(userId, conversationId, "Agent");
const isLead = !metadata.parentConversationId;

function text(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

const server = new McpServer({ name: "veykor-collab", version: "0.0.0" });

server.registerTool(
  "veykor_list_agents",
  {
    description:
      "List agents available in this project for delegation. Only the lead can delegate.",
    inputSchema: {},
  },
  async () => {
    const agents = listAgentsForProject(userId, projectId).map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      providerId: agent.providerId,
      modelId: agent.modelId,
    }));

    return { content: [{ type: "text", text: text({ agents }) }] };
  },
);

server.registerTool(
  "veykor_list_collab",
  {
    description:
      "List current collaboration participants, tasks, and states for this chat.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: text({
          participants: listParticipants(userId, parentId),
          tasks: listTasks(userId, parentId).map((task) => ({
            ...task,
            instructions: task.instructions.slice(0, 500),
            result: task.result.slice(0, 500),
          })),
          summary: currentStateSummary(userId, parentId),
        }),
      },
    ],
  }),
);

server.registerTool(
  "veykor_delegate",
  {
    description:
      "Lead only. Delegate a task to a project agent. Returns immediately with a task ID; results arrive later as collaboration updates. Set dependsOn to task IDs that must complete first.",
    inputSchema: {
      agentId: z.string().describe("Project agent ID from veykor_list_agents"),
      title: z.string().describe("Short task title"),
      instructions: z.string().describe("What the delegate should do"),
      expectedOutcome: z
        .string()
        .optional()
        .describe("What a good result looks like"),
      context: z
        .string()
        .optional()
        .describe("Explicit task context (never secrets)"),
      dependsOn: z
        .array(z.string())
        .optional()
        .describe("Task IDs that must complete first"),
    },
  },
  async (input) => {
    try {
      const { task, reusedSession } = await delegateTask({
        userId,
        parentConversationId: parentId,
        callerConversationId: conversationId,
        agentId: input.agentId,
        title: input.title,
        instructions: input.instructions,
        expectedOutcome: input.expectedOutcome,
        context: input.context,
        dependsOn: input.dependsOn,
      });

      return {
        content: [
          {
            type: "text",
            text: text({
              taskId: task.id,
              agent: task.agentName,
              state: task.state,
              reusedSession,
              note: "The task is queued. Continue your turn; results arrive as collaboration updates.",
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: text({
              error:
                error instanceof Error ? error.message : "Unable to delegate",
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "veykor_send_message",
  {
    description:
      "Send a correlated question, answer, progress note, or note to the lead, a participating agent (exact name), or all participants.",
    inputSchema: {
      to: z
        .string()
        .describe("'lead', an exact participant agent name, or 'all'"),
      kind: z.enum(["question", "answer", "progress", "result", "note", "ack"]),
      text: z.string().describe("Message text"),
      taskId: z.string().optional().describe("Related task ID"),
      correlationId: z
        .string()
        .optional()
        .describe("Correlation with a prior message"),
    },
  },
  async (input) => {
    try {
      const { messageId, event } = sendCollabMessage({
        userId,
        parentConversationId: parentId,
        callerConversationId: conversationId,
        callerName,
        callerKind: "agent",
        to: input.to,
        kind: input.kind,
        text: input.text,
        taskId: input.taskId,
        correlationId: input.correlationId,
      });

      return {
        content: [
          { type: "text", text: text({ messageId, eventSeq: event.seq }) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: text({
              error: error instanceof Error ? error.message : "Unable to send",
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "veykor_read_events",
  {
    description:
      "Read pending collaboration events and the current shared state. Marks events read for this session.",
    inputSchema: {
      sinceSeq: z
        .number()
        .optional()
        .describe("Return events after this sequence number"),
    },
  },
  async (input) => {
    const participant = listParticipants(userId, parentId).find(
      (entry) => entry.conversationId === conversationId,
    );
    const since = input.sinceSeq ?? participant?.lastDeliveredSeq ?? 0;
    const events = unreadSince(userId, parentId, since);
    const maxSeq = events.reduce(
      (max, event) => Math.max(max, event.seq),
      since,
    );

    if (events.length > 0) {
      markReadThrough(userId, parentId, conversationId, maxSeq);
    }

    return {
      content: [
        {
          type: "text",
          text: text({
            events,
            summary: currentStateSummary(userId, parentId),
            throughSeq: maxSeq,
          }),
        },
      ],
    };
  },
);

server.registerTool(
  "veykor_report_progress",
  {
    description:
      "Delegate only. Report meaningful progress on your own task. Use sparingly.",
    inputSchema: {
      taskId: z.string().describe("Your task ID"),
      text: z.string().describe("Progress update"),
    },
  },
  async (input) => {
    try {
      const event = reportProgress({
        userId,
        parentConversationId: parentId,
        callerConversationId: conversationId,
        callerName,
        taskId: input.taskId,
        text: input.text,
      });

      return {
        content: [{ type: "text", text: text({ eventSeq: event.seq }) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: text({
              error:
                error instanceof Error ? error.message : "Unable to report",
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "veykor_report_result",
  {
    description:
      "Delegate only. Report the final result for your task exactly once. The task is not done until you call this.",
    inputSchema: {
      taskId: z.string().describe("Your task ID"),
      result: z.string().describe("Findings or final result"),
      summary: z
        .string()
        .optional()
        .describe("One-paragraph summary for coordination"),
    },
  },
  async (input) => {
    try {
      const task = reportResult({
        userId,
        parentConversationId: parentId,
        callerConversationId: conversationId,
        callerName,
        taskId: input.taskId,
        result: input.result,
        summary: input.summary,
      });

      return {
        content: [
          {
            type: "text",
            text: text({
              taskId: task.id,
              state: describeTaskState(task.state),
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: text({
              error:
                error instanceof Error ? error.message : "Unable to report",
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "veykor_request_interruption",
  {
    description:
      "Lead only. Request interruption of a delegated task by task ID. Stopping is confirmed asynchronously; watch for the interruption event.",
    inputSchema: {
      taskId: z.string().optional().describe("Task ID to stop"),
      agentName: z
        .string()
        .optional()
        .describe("Exact delegate agent name to stop"),
      reason: z.string().optional().describe("Why the task should stop"),
    },
  },
  async (input) => {
    if (!isLead) {
      return {
        content: [
          {
            type: "text",
            text: text({ error: "Only the lead can stop delegates" }),
          },
        ],
        isError: true,
      };
    }

    try {
      let taskId = input.taskId || "";

      if (!taskId && input.agentName) {
        const match = listTasks(userId, parentId).filter(
          (task) =>
            task.agentName.toLowerCase() === input.agentName!.toLowerCase() &&
            !["completed", "interrupted", "failed", "blocked"].includes(
              task.state,
            ),
        );

        if (match.length !== 1) {
          throw new Error(
            match.length === 0
              ? `${input.agentName} has no active task to stop`
              : `More than one active task matches ${input.agentName}; pass a task ID`,
          );
        }

        taskId = match[0].id;
      }

      const task = taskId ? readTask(userId, taskId) : undefined;

      if (!task || task.parentConversationId !== parentId) {
        throw new Error("Task not found in this chat");
      }

      const { task: updated } = await requestInterruption(
        {
          userId,
          taskId,
          reason: input.reason || "",
          sourceKind: "agent",
          sourceConversationId: conversationId,
          sourceName: callerName,
        },
        { providerOps: false },
      );

      return {
        content: [
          {
            type: "text",
            text: text({
              taskId: updated.id,
              state: updated.state,
              interruptState: updated.interruptState,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: text({
              error: error instanceof Error ? error.message : "Unable to stop",
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

await server.connect(new StdioServerTransport());
