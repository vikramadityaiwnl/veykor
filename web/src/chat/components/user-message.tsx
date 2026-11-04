import { useState } from "react";
import type { ChatHistoryItem } from "@veykor/shared";
import MissingAttachment from "../../components/missing-attachment/missing-attachment.tsx";
import type { SentAttachment } from "../chat-store.ts";

interface Props {
  images: Array<SentAttachment>;
  item: ChatHistoryItem;
}

function cleanText(text: string): string {
  return text.replace(/\[Image #\d+\]/g, "").trim();
}

function UserMessage(props: Props) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  const text = cleanText(props.item.text);

  function handleError(id: string) {
    setFailed((current) => new Set(current).add(id));
  }

  if (text === "" && props.images.length === 0) {
    return null;
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] space-y-2">
        {props.images.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            {props.images.map((image) =>
              image.url === "" || failed.has(image.id) ? (
                <MissingAttachment
                  key={`${props.item.itemId}-image-${image.id}`}
                  label={
                    image.url === ""
                      ? "Image not found"
                      : "Cannot load the image."
                  }
                />
              ) : (
                <img
                  alt="Attached image"
                  className="max-h-48 rounded-xl border border-zinc-800 object-cover"
                  key={`${props.item.itemId}-image-${image.id}`}
                  onError={() => handleError(image.id)}
                  src={image.url}
                />
              ),
            )}
          </div>
        ) : null}

        {text !== "" ? (
          <div className="rounded-2xl rounded-tr-md bg-zinc-800 px-4 py-2.5 text-sm font-light text-zinc-100 whitespace-pre-wrap break-words">
            {text}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default UserMessage;
