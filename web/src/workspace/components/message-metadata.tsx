import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { ChatMessageMetadata } from "@astryxdesign/core/Chat";
import { Timestamp } from "@astryxdesign/core/Timestamp";

interface Props {
  text: string;
  createdAt: number;
}

export function MessageMetadata(props: Props) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }
    const timer = window.setTimeout(() => setCopyStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  return (
    <ChatMessageMetadata
      className="pointer-events-none opacity-0 transition-opacity group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100"
      timestamp={
        props.createdAt > 0 ? (
          <Timestamp
            value={new Date(props.createdAt).toISOString()}
            format="time"
            hasTooltip
          />
        ) : undefined
      }
      footer={
        props.text ? (
          <Button
            label={
              copyStatus === "copied"
                ? "Copied"
                : copyStatus === "error"
                  ? "Unable to copy"
                  : "Copy message"
            }
            variant="ghost"
            size="sm"
            className="size-(--spacing-6)! min-h-0! min-w-0! p-1! text-(--color-text-secondary)! [&_svg]:text-(--color-text-secondary)!"
            isIconOnly
            icon={
              <FontAwesomeIcon
                icon={copyStatus === "copied" ? faCheck : faCopy}
                aria-hidden="true"
                className="size-(--spacing-3)!"
              />
            }
            clickAction={async () => {
              try {
                await navigator.clipboard.writeText(props.text);
                setCopyStatus("copied");
              } catch {
                setCopyStatus("error");
              }
            }}
          />
        ) : undefined
      }
    />
  );
}
