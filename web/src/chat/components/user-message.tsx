import { useState } from "react";
import type { ChatHistoryItem } from "@veykor/shared";

interface Props {
  images: Array<string>;
  item: ChatHistoryItem;
}

function cleanText(text: string): string {
  return text.replace(/\[Image #\d+\]/g, "").trim();
}

function UserMessage(props: Props) {
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());

  const text = cleanText(props.item.text);

  function handleError(index: number) {
    setFailed((current) => new Set(current).add(index));
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] space-y-2">
        {props.images.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            {props.images.map((source, index) =>
              failed.has(index) ? (
                <p
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-6 text-xs font-light text-zinc-500"
                  key={`${props.item.itemId}-image-${index}`}
                >
                  Cannot load the image.
                </p>
              ) : (
                <img
                  alt="Attached image"
                  className="max-h-48 rounded-xl border border-zinc-800 object-cover"
                  key={`${props.item.itemId}-image-${index}`}
                  onError={() => handleError(index)}
                  src={source}
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
