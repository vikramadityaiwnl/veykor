import { Fragment, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  chatPaths,
  extractGeneratedImageIds,
  isGenerateImageTool,
} from "@veykor/shared";
import type {
  ChatHistoryItem,
  GeneratedImageArtifact,
  QuestionRequest,
} from "@veykor/shared";
import type { LivePreview, SentAttachment } from "../chat-store.ts";
import AgentMessage from "./agent-message.tsx";
import GeneratedImage from "./generated-image.tsx";
import QuestionHistoryRecord from "./question-history-record.tsx";
import ThinkingBlock from "./thinking-block.tsx";
import ToolCallBlock from "./tool-call-block.tsx";
import UserMessage from "./user-message.tsx";

interface Props {
  chatId: string;
  generatedImages: Array<GeneratedImageArtifact>;
  imageUrls: Array<SentAttachment>;
  hideThinkingByDefault: boolean;
  items: Array<ChatHistoryItem>;
  livePreviews: Record<string, LivePreview>;
  questions: Array<QuestionRequest>;
  streaming: boolean;
  streamingTurnId: string;
  streamingStartedAt: number;
  turnDurations: Record<string, number>;
}

interface TimelineEntry {
  at: string;
  node: ReactNode;
}

function allocateImages(
  items: Array<ChatHistoryItem>,
  imageUrls: Array<SentAttachment>,
): Map<string, Array<SentAttachment>> {
  const assigned = new Map<string, Array<SentAttachment>>();

  let cursor = 0;

  for (const item of items) {
    if (item.kind !== "userMessage" || item.attachments.length === 0) {
      continue;
    }

    assigned.set(
      item.itemId,
      imageUrls.slice(cursor, cursor + item.attachments.length),
    );

    cursor += item.attachments.length;
  }

  return assigned;
}

function collectUserTurns(items: Array<ChatHistoryItem>): Set<string> {
  const turns = new Set<string>();

  for (const item of items) {
    if (item.kind === "userMessage" && item.turnId !== null) {
      turns.add(item.turnId);
    }
  }

  return turns;
}

function collectTurnItems(items: Array<ChatHistoryItem>): {
  itemsByTurn: Map<string, Array<ChatHistoryItem>>;
  finalItemIds: Set<string>;
} {
  const itemsByTurn = new Map<string, Array<ChatHistoryItem>>();

  for (const item of items) {
    if (item.turnId === null || item.kind === "userMessage") {
      continue;
    }

    const turnItems = itemsByTurn.get(item.turnId) ?? [];

    turnItems.push(item);
    itemsByTurn.set(item.turnId, turnItems);
  }

  const finalItemIds = new Set<string>();

  for (const turnItems of itemsByTurn.values()) {
    const finalMessage = turnItems
      .filter((item) => item.kind === "agentMessage")
      .at(-1);

    if (finalMessage !== undefined) {
      finalItemIds.add(finalMessage.itemId);
    }
  }

  return { itemsByTurn, finalItemIds };
}

function toolPrompt(item: ChatHistoryItem): string {
  try {
    const parsed: unknown = JSON.parse(item.args);

    if (typeof parsed !== "object" || parsed === null) {
      return "";
    }

    const prompt = (parsed as Record<string, unknown>)["prompt"];

    return typeof prompt === "string" ? prompt : "";
  } catch {
    return "";
  }
}

interface BoundImages {
  bound: Array<GeneratedImageArtifact>;
  pending: Array<string>;
}

function bindToolImages(
  item: ChatHistoryItem,
  images: Array<GeneratedImageArtifact>,
): BoundImages {
  const empty: BoundImages = { bound: [], pending: [] };

  if (!isGenerateImageTool(item.tool)) {
    return empty;
  }

  const direct = images.filter((image) => image.toolItemId === item.itemId);

  if (direct.length > 0) {
    return { bound: direct, pending: [] };
  }

  const byId = new Map(images.map((image) => [image.id, image]));
  const bound: Array<GeneratedImageArtifact> = [];
  const pending: Array<string> = [];

  for (const id of extractGeneratedImageIds(item.visibleOutput)) {
    const found = byId.get(id);

    if (found === undefined) {
      pending.push(id);
    } else {
      bound.push(found);
    }
  }

  if (bound.length + pending.length > 0) {
    return { bound, pending };
  }

  const prompt = toolPrompt(item);

  if (item.turnId !== null && prompt !== "") {
    const sameTurn = images.filter(
      (image) => image.turnId === item.turnId && image.prompt === prompt,
    );

    if (sameTurn.length > 0) {
      return { bound: sameTurn, pending: [] };
    }
  }

  if (item.status === "inProgress") {
    const generating = images
      .filter((image) => image.status === "generating")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1);

    if (generating !== undefined) {
      return { bound: [generating], pending: [] };
    }
  }

  return empty;
}

function MessageList(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const assistantTurns = collectTurnItems(props.items);
  const finalTurnIds = new Set(
    props.items
      .filter(
        (item) =>
          item.kind === "agentMessage" &&
          assistantTurns.finalItemIds.has(item.itemId) &&
          item.turnId !== null,
      )
      .map((item) => item.turnId as string),
  );

  function handleScroll() {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    stickToBottomRef.current = distanceFromBottom <= 4;
  }

  useEffect(() => {
    const container = containerRef.current;

    if (container === null || !stickToBottomRef.current) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [props.items, props.questions, props.streaming, props.generatedImages]);

  const imageByItem = allocateImages(props.items, props.imageUrls);
  const userTurns = collectUserTurns(props.items);
  const latestAssistantMessageId = [...props.items]
    .reverse()
    .find((item) => item.kind === "agentMessage")?.itemId;
  const claimed = new Set<string>();

  for (const item of props.items) {
    const images = bindToolImages(item, props.generatedImages);

    for (const artifact of images.bound) {
      claimed.add(artifact.id);
    }

    for (const id of images.pending) {
      claimed.add(id);
    }
  }

  const orphaned = props.generatedImages.filter(
    (image) => !claimed.has(image.id),
  );
  const orphanedByTurn = new Map<string, Array<GeneratedImageArtifact>>();

  for (const artifact of orphaned) {
    const turnImages = orphanedByTurn.get(artifact.turnId) ?? [];

    turnImages.push(artifact);
    orphanedByTurn.set(artifact.turnId, turnImages);
  }

  const liveKey =
    props.streamingTurnId !== "" ? props.streamingTurnId : "pending";

  const liveHasThinking =
    props.streamingTurnId !== "" &&
    assistantTurns.itemsByTurn.has(props.streamingTurnId);

  const liveAnchored =
    props.streamingTurnId !== "" && userTurns.has(props.streamingTurnId);

  function thinkingBlock(
    turnKey: string,
    live: boolean,
    children: ReactNode,
    hasActivity = false,
  ): ReactNode {
    if (
      !live &&
      children === null &&
      !hasActivity &&
      (props.turnDurations[turnKey] ?? 0) <= 0
    ) {
      return null;
    }

    return (
      <ThinkingBlock
        durationMs={props.turnDurations[turnKey] ?? 0}
        hideByDefault={props.hideThinkingByDefault}
        key={`thinking-${turnKey}`}
        running={live}
        startedAt={props.streamingStartedAt}
        children={children}
      />
    );
  }

  function renderThinkingItem(item: ChatHistoryItem): ReactNode {
    if (item.kind === "agentMessage") {
      if (assistantTurns.finalItemIds.has(item.itemId)) {
        return null;
      }

      return <AgentMessage item={item} key={item.itemId} />;
    }

    if (item.kind !== "toolCall") {
      return null;
    }

    const preview = props.livePreviews[item.itemId] ?? null;
    const previewSrc =
      props.chatId !== ""
        ? chatPaths.preview(props.chatId, item.itemId)
        : undefined;

    if (!isGenerateImageTool(item.tool)) {
      return (
        <ToolCallBlock
          chatId={props.chatId}
          item={item}
          key={item.itemId}
          preview={preview}
          previewSrc={previewSrc}
        />
      );
    }

    if (item.turnId !== null && finalTurnIds.has(item.turnId)) {
      return (
        <ToolCallBlock
          chatId={props.chatId}
          item={item}
          key={item.itemId}
          preview={preview}
          previewSrc={previewSrc}
        />
      );
    }

    const images = bindToolImages(item, props.generatedImages);
    const cards: Array<ReactNode> = images.bound.map((artifact) => (
      <GeneratedImage
        key={artifact.id}
        artifact={artifact}
        artifactId=""
        generating={false}
        prompt=""
        error=""
      />
    ));

    for (const id of images.pending) {
      cards.push(
        <GeneratedImage
          key={id}
          artifact={null}
          artifactId={id}
          generating={false}
          prompt={toolPrompt(item)}
          error=""
        />,
      );
    }

    if (
      cards.length === 0 &&
      (item.status === "inProgress" || item.status === "")
    ) {
      cards.push(
        <GeneratedImage
          key={`${item.itemId}-generating`}
          artifact={null}
          artifactId=""
          generating={true}
          prompt={toolPrompt(item)}
          error=""
        />,
      );
    }

    if (
      cards.length === 0 &&
      item.status !== "inProgress" &&
      item.status !== "" &&
      item.status !== "completed"
    ) {
      cards.push(
        <GeneratedImage
          key={`${item.itemId}-failed`}
          artifact={null}
          artifactId=""
          generating={false}
          prompt=""
          error={
            item.visibleOutput.trim() === ""
              ? "Image generation did not return an image."
              : item.visibleOutput.trim().slice(0, 300)
          }
        />,
      );
    }

    if (cards.length === 0) {
      return (
        <ToolCallBlock
          chatId={props.chatId}
          item={item}
          key={item.itemId}
          preview={preview}
          previewSrc={previewSrc}
        />
      );
    }

    return (
      <Fragment key={item.itemId}>
        <ToolCallBlock chatId={props.chatId} item={item} />

        <div className="space-y-3 pt-3">{cards}</div>
      </Fragment>
    );
  }

  function thinkingAfterUser(turnId: string | null): ReactNode {
    if (turnId === null) {
      return null;
    }

    const live = props.streaming && turnId === props.streamingTurnId;

    if (live && props.hideThinkingByDefault) {
      return null;
    }

    const turnItems = assistantTurns.itemsByTurn.get(turnId) ?? [];
    const activity: Array<TimelineEntry> = [];

    for (const item of turnItems) {
      if (
        item.kind === "agentMessage" &&
        assistantTurns.finalItemIds.has(item.itemId)
      ) {
        continue;
      }

      const node = renderThinkingItem(item);

      if (node !== null) {
        activity.push({ at: item.recordedAt, node });
      }
    }

    for (const artifact of orphanedByTurn.get(turnId) ?? []) {
      if (finalTurnIds.has(turnId)) {
        continue;
      }

      activity.push({
        at: artifact.createdAt,
        node: (
          <GeneratedImage
            key={artifact.id}
            artifact={artifact}
            artifactId=""
            generating={false}
            prompt=""
            error=""
          />
        ),
      });
    }

    activity.sort((first, second) => first.at.localeCompare(second.at));
    const children =
      activity.length === 0 ? null : activity.map((entry) => entry.node);
    const hasActivity = turnItems.some(
      (item) =>
        item.kind !== "agentMessage" ||
        !assistantTurns.finalItemIds.has(item.itemId),
    );
    return thinkingBlock(
      turnId,
      live,
      children,
      hasActivity || (orphanedByTurn.get(turnId)?.length ?? 0) > 0,
    );
  }

  function renderItem(item: ChatHistoryItem) {
    if (item.kind === "userMessage") {
      return (
        <Fragment key={item.itemId}>
          <UserMessage
            images={imageByItem.get(item.itemId) ?? []}
            item={item}
          />
          {thinkingAfterUser(item.turnId)}
        </Fragment>
      );
    }

    if (item.kind === "agentMessage") {
      const isFinal = assistantTurns.finalItemIds.has(item.itemId);
      const isLive =
        props.streaming &&
        (item.turnId === props.streamingTurnId || item.status === "inProgress");

      if (!isFinal || isLive) {
        return null;
      }

      const turnImages =
        item.turnId === null
          ? []
          : props.generatedImages.filter(
              (image) => image.turnId === item.turnId,
            );
      const message = (
        <Fragment key={item.itemId}>
          <AgentMessage item={item} />

          {turnImages.length > 0 ? (
            <div className="space-y-3 pt-3">
              {turnImages.map((artifact) => (
                <GeneratedImage
                  key={artifact.id}
                  artifact={artifact}
                  artifactId=""
                  generating={false}
                  prompt=""
                  error=""
                />
              ))}
            </div>
          ) : null}
        </Fragment>
      );

      return item.itemId === latestAssistantMessageId && !props.streaming ? (
        <div
          className="animate-[veykor-message-in_240ms_ease-out_both] motion-reduce:animate-none"
          key={item.itemId}
        >
          {message}
        </div>
      ) : (
        message
      );
    }

    return null;
  }

  const timeline: Array<TimelineEntry> = [];

  props.items.forEach((item) => {
    const node = renderItem(item);

    if (node !== null) {
      timeline.push({ at: item.recordedAt, node });
    }
  });

  const questions = [...props.questions].sort((a, b) => {
    const first = a.settledAt || a.createdAt;
    const second = b.settledAt || b.createdAt;

    return first.localeCompare(second);
  });

  for (const request of questions) {
    const at = request.settledAt || request.createdAt;
    const entry: TimelineEntry = {
      at,
      node: <QuestionHistoryRecord key={request.id} request={request} />,
    };
    const index = timeline.findIndex(
      (item) => item.at !== "" && item.at.localeCompare(at) > 0,
    );

    if (index === -1) {
      timeline.push(entry);
    } else {
      timeline.splice(index, 0, entry);
    }
  }

  return (
    <div
      className="flex-1 overflow-y-auto"
      onScroll={handleScroll}
      ref={containerRef}
    >
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-24 pt-6">
        {timeline.map((entry) => entry.node)}

        {props.streaming &&
        !props.hideThinkingByDefault &&
        !liveAnchored &&
        !liveHasThinking
          ? thinkingBlock(liveKey, true, null)
          : null}
      </div>
    </div>
  );
}

export default MessageList;
