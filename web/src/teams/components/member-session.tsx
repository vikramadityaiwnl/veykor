import { useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  PaperClipIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StopIcon } from "@heroicons/react/24/solid";
import type { ChatDetail, ChatImageInput, TeamMember } from "@veykor/shared";
import {
  cancelTurn,
  fetchChat,
  steerTurn,
  streamTurn,
  subscribeChat,
} from "../../chat/chat-client.ts";
import {
  appendChatAttachmentIds,
  blobFromBase64,
  readAttachment,
  readChatAttachmentIds,
  saveAttachment,
} from "../../chat/attachment-store.ts";
import type { SentAttachment } from "../../chat/chat-store.ts";
import MessageList from "../../chat/components/message-list.tsx";
import LoadingSpinner from "../../components/loading-spinner/loading-spinner.tsx";
import { useTeamStore } from "../team-store.ts";
import MemberApproval from "./member-approval.tsx";

interface Props {
  active: boolean;
  member: TeamMember;
}

interface Attachment {
  id: string;
  name: string;
  mediaType: string;
  base64Data: string;
}

function MemberSession(props: Props) {
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState(false);
  const [sentImages, setSentImages] = useState<SentAttachment[]>([]);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const liveRef = useRef(true);
  const requestRunRef = useRef(0);
  const turnRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;

    liveRef.current = true;
    const imageUrls: string[] = [];

    void readChatAttachmentIds(props.member.id)
      .then(async (ids) => {
        const stored = await Promise.all(
          ids.map(async (id) => {
            const attachment = await readAttachment(id);

            if (!attachment || !alive) {
              return null;
            }

            const url = URL.createObjectURL(attachment.blob);

            imageUrls.push(url);
            return { id, url };
          }),
        );

        if (alive) {
          setSentImages((current) => [
            ...stored.filter(
              (entry): entry is SentAttachment => entry !== null,
            ),
            ...current.filter((entry) => !ids.includes(entry.id)),
          ]);
        }
      })
      .catch(() => {});

    return () => {
      alive = false;
      liveRef.current = false;
      turnRequestRef.current?.abort();
      imageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [props.member.id]);

  useEffect(() => {
    if (!props.active) {
      return;
    }

    let alive = true;
    const accept = (snapshot: ChatDetail) => {
      if (alive) {
        setDetail(snapshot);
        setError("");
      }
    };

    void fetchChat(props.member.id)
      .then(accept)
      .catch((cause: unknown) => {
        if (alive) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load this agent.",
          );
        }
      });
    const unsubscribe = subscribeChat(props.member.id, accept);

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [props.member.id, props.active]);

  async function refresh() {
    const snapshot = await fetchChat(props.member.id);

    if (liveRef.current) {
      setDetail(snapshot);
    }
  }

  async function send() {
    if ((!draft.trim() && attachments.length === 0) || pending || !detail) {
      return;
    }

    setPending(true);
    setError("");

    requestRunRef.current += 1;
    const requestRun = requestRunRef.current;
    const controller = new AbortController();

    turnRequestRef.current = controller;
    const sentAttachments = [...attachments];

    function acceptMessage() {
      setDraft((current) => (current === text ? "" : current));
      setAttachments((current) =>
        current.filter(
          (attachment) =>
            !sentAttachments.some((sent) => sent.id === attachment.id),
        ),
      );
      setPending(false);
      setSentImages((current) => [
        ...current,
        ...sentAttachments.map((attachment) => ({
          id: attachment.id,
          url: `data:${attachment.mediaType};base64,${attachment.base64Data}`,
        })),
      ]);
      void Promise.all(
        sentAttachments.map((attachment) =>
          saveAttachment({
            id: attachment.id,
            name: attachment.name,
            mediaType: attachment.mediaType,
            blob: blobFromBase64(attachment.base64Data, attachment.mediaType),
          }),
        ),
      )
        .then(() =>
          appendChatAttachmentIds(
            props.member.id,
            sentAttachments.map((attachment) => attachment.id),
          ),
        )
        .catch(() => {});
    }

    const text = draft;
    const images: ChatImageInput[] = attachments.map((attachment) => ({
      mediaType: attachment.mediaType,
      base64Data: attachment.base64Data,
    }));

    try {
      if (detail.running) {
        await steerTurn(props.member.id, {
          text,
          images,
          expectedTurnId: detail.activeTurnId,
        });
        acceptMessage();
      } else {
        await streamTurn(
          props.member.id,
          text,
          images,
          (event) => {
            if (!liveRef.current) {
              return;
            }

            if (event.type === "turn-started") {
              acceptMessage();
              controller.abort();
              setDetail((current) =>
                current
                  ? {
                      ...current,
                      running: true,
                      activeTurnId: event.turnId,
                      activeTurnStartedAt: event.startedAt ?? Date.now(),
                    }
                  : current,
              );
            } else if (event.type === "item") {
              setDetail((current) => {
                if (!current) {
                  return current;
                }

                const index = current.items.findIndex(
                  (item) => item.itemId === event.item.itemId,
                );
                const items = [...current.items];

                if (index < 0) {
                  items.push(event.item);
                } else {
                  items[index] = event.item;
                }

                return { ...current, items };
              });
            } else if (event.type === "delta") {
              setDetail((current) =>
                current
                  ? {
                      ...current,
                      items: current.items.map((item) =>
                        item.itemId === event.itemId && event.field === "text"
                          ? { ...item, text: item.text + event.delta }
                          : item,
                      ),
                    }
                  : current,
              );
            }
          },
          controller.signal,
        );
      }

      await refresh();
      await useTeamStore.getState().refresh();
    } catch (cause) {
      if (liveRef.current && !controller.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to send this message.",
        );
      }
    } finally {
      if (turnRequestRef.current === controller) {
        turnRequestRef.current = null;
      }

      if (liveRef.current && requestRunRef.current === requestRun) {
        setPending(false);
      }
    }
  }

  async function stop() {
    if (!detail?.activeTurnId) {
      return;
    }

    try {
      await cancelTurn(props.member.id, detail.activeTurnId);
      await refresh();
      await useTeamStore.getState().refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to stop this agent.",
      );
    }
  }

  async function addAttachments(files: FileList | null) {
    if (!files) {
      return;
    }

    try {
      if (attachments.length + files.length > 4) {
        throw new Error("Attach at most four images.");
      }

      const next = await Promise.all(
        Array.from(files).map(async (file) => {
          if (
            !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
              file.type,
            ) ||
            file.size > 6 * 1024 * 1024
          ) {
            throw new Error("Use PNG, JPEG, WebP, or GIF images under 6 MB.");
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";

          for (const byte of bytes) {
            binary += String.fromCharCode(byte);
          }

          return {
            id: crypto.randomUUID(),
            name: file.name,
            mediaType: file.type,
            base64Data: btoa(binary),
          };
        }),
      );

      setAttachments((current) => [...current, ...next]);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to attach these images.",
      );
    }

    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }

  return (
    <section
      aria-label={`${props.member.name} conversation`}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <p
          className="min-w-0 truncate text-xs font-light text-zinc-500"
          title={props.member.task}
        >
          {props.member.task || "Team conversation"}
        </p>
        <span className="text-xs font-light text-zinc-400">
          {detail?.running ? "running" : props.member.status}
        </span>
      </div>

      {detail ? (
        <MessageList
          imageUrls={sentImages}
          items={detail.items}
          streaming={detail.running}
          streamingTurnId={detail.activeTurnId}
          streamingStartedAt={detail.activeTurnStartedAt}
          thinkingSnapshots={{}}
          turnDurations={detail.turnDurations}
        />
      ) : (
        <div className="grid flex-1 place-items-center text-zinc-500">
          <LoadingSpinner />
        </div>
      )}

      <div className="max-h-56 space-y-3 overflow-y-auto px-4">
        {detail?.pendingApprovals.map((approval) => (
          <MemberApproval
            key={approval.approvalId}
            chatId={props.member.id}
            approval={approval}
            onDecided={() => {
              void refresh();
            }}
          />
        ))}
      </div>

      <div className="shrink-0 space-y-2 p-4">
        {(error || props.member.error) && (
          <p role="alert" className="text-xs font-light text-rose-400">
            {error || props.member.error}
          </p>
        )}
        <form
          className="rounded-2xl border border-zinc-700 bg-zinc-900 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label={`Message ${props.member.name}`}
            placeholder={`Message ${props.member.name}…`}
            className="max-h-40 w-full resize-none bg-transparent text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-600"
            rows={2}
            maxLength={20000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 py-2">
              {attachments.map((attachment, index) => (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                  key={index}
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  {attachment.name}
                  <XMarkIcon className="size-3" />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(event) => {
                void addAttachments(event.target.files);
              }}
            />
            <button
              type="button"
              title="Attach images"
              aria-label="Attach images to agent message"
              className="rounded-full p-2 text-zinc-500 hover:text-zinc-100"
              onClick={() => fileRef.current?.click()}
            >
              <PaperClipIcon className="size-4" />
            </button>
            <div className="flex items-center gap-2">
              {detail?.running && (
                <button
                  type="button"
                  title={`Stop ${props.member.name}`}
                  className="rounded-full bg-red-600 p-2 text-white hover:bg-red-500"
                  onClick={() => {
                    void stop();
                  }}
                >
                  <StopIcon className="size-4" />
                </button>
              )}
              <button
                type="submit"
                title={
                  detail?.running ? "Steer this agent" : "Send to this agent"
                }
                disabled={
                  pending || !detail || (!draft.trim() && !attachments.length)
                }
                className="rounded-full bg-zinc-100 p-2 text-zinc-950 disabled:opacity-40"
              >
                {pending ? (
                  <LoadingSpinner />
                ) : (
                  <ArrowUpIcon className="size-4" />
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}

export default MemberSession;
