import { useChatStore } from "../chat-store.ts";
import QueueList from "./queue-list.tsx";

function QueuedMessages() {
  const queuedMessages = useChatStore((s) => s.queuedMessages);
  const steerQueuedMessage = useChatStore((s) => s.steerQueuedMessage);
  const editQueuedMessage = useChatStore((s) => s.editQueuedMessage);
  const removeQueuedMessage = useChatStore((s) => s.removeQueuedMessage);
  const reorderQueuedMessage = useChatStore((s) => s.reorderQueuedMessage);

  if (queuedMessages.length === 0) {
    return null;
  }

  return (
    <QueueList
      items={queuedMessages.map((message) => ({
        id: message.id,
        text: message.text,
        imageCount: message.images.length,
      }))}
      onDelete={removeQueuedMessage}
      onEdit={editQueuedMessage}
      onReorder={reorderQueuedMessage}
      onSteer={steerQueuedMessage}
    />
  );
}

export default QueuedMessages;
