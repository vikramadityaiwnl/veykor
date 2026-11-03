import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useChatStore } from "../chat-store.ts";
import type { QueuedMessage } from "../chat-store.ts";

function messageLabel(message: QueuedMessage): string {
  if (message.text !== "") {
    return message.text;
  }

  if (message.images.length === 1) {
    return "1 image";
  }

  return `${message.images.length} images`;
}

function QueuedMessages() {
  const queuedMessages = useChatStore((s) => s.queuedMessages);
  const steerQueuedMessage = useChatStore((s) => s.steerQueuedMessage);
  const editQueuedMessage = useChatStore((s) => s.editQueuedMessage);
  const removeQueuedMessage = useChatStore((s) => s.removeQueuedMessage);

  if (queuedMessages.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-zinc-800 px-4 py-3">
      <p className="text-xs font-medium text-zinc-500">Queued messages</p>

      <ul className="mt-2 space-y-1.5">
        {queuedMessages.map((message) => {
          return (
            <li className="flex items-center gap-1" key={message.id}>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                {messageLabel(message)}
              </span>

              <button
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-light text-zinc-400 hover:text-zinc-200"
                onClick={() => steerQueuedMessage(message.id)}
                title="Send now"
                type="button"
              >
                Steer
              </button>

              <button
                aria-label="Edit in composer"
                className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                onClick={() => editQueuedMessage(message.id)}
                title="Edit in composer"
                type="button"
              >
                <PencilIcon aria-hidden="true" className="size-4" />
              </button>

              <button
                aria-label="Delete queued message"
                className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-rose-300"
                onClick={() => removeQueuedMessage(message.id)}
                title="Delete queued message"
                type="button"
              >
                <TrashIcon aria-hidden="true" className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default QueuedMessages;
