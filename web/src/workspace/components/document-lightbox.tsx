import { useEffect, useMemo } from "react";
import type { ChatAttachment } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faFile } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { dataUrlToBlob, formatFileSize } from "../chat-attachments";

interface Props {
  attachment: ChatAttachment | null;
  onClose: () => void;
}

export function DocumentLightbox(props: Props) {
  const attachment = props.attachment;
  const dataUrl = attachment?.dataUrl || "";
  const objectUrl = useMemo(() => {
    if (!dataUrl) {
      return "";
    }

    try {
      return URL.createObjectURL(dataUrlToBlob(dataUrl));
    } catch {
      return "";
    }
  }, [dataUrl]);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  const previewUrl = objectUrl || dataUrl;

  function download() {
    if (!previewUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = attachment?.name || "file";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function close(open: boolean) {
    if (!open) {
      props.onClose();
    }
  }

  return (
    <Dialog
      isOpen={attachment !== null}
      variant="fullscreen"
      onOpenChange={close}
    >
      <Layout
        header={
          <DialogHeader
            title={attachment?.name || "Preview"}
            subtitle={
              attachment
                ? `${formatFileSize(attachment.size)}${attachment.mimeType ? ` · ${attachment.mimeType}` : ""}`
                : ""
            }
            onOpenChange={close}
            endContent={
              previewUrl ? (
                <Button
                  label={`Download ${attachment?.name || "file"}`}
                  size="sm"
                  variant="secondary"
                  isIconOnly
                  icon={<FontAwesomeIcon icon={faDownload} />}
                  clickAction={download}
                />
              ) : undefined
            }
          />
        }
        content={
          <LayoutContent>
            <VStack gap={0} className="veykor-lightbox-frame min-h-full">
              {!attachment ? null : attachment.kind === "image" &&
                previewUrl ? (
                <Center className="min-h-[60dvh]">
                  <img
                    src={previewUrl}
                    alt={attachment.name}
                    className="max-h-[75dvh] max-w-full object-contain"
                  />
                </Center>
              ) : attachment.kind === "pdf" && previewUrl ? (
                <Center className="min-h-[60dvh]">
                  <iframe
                    src={previewUrl}
                    title={attachment.name}
                    className="h-[75dvh] w-full max-w-6xl border-0"
                  />
                </Center>
              ) : attachment.kind === "text" ||
                (attachment.kind === "spreadsheet" && attachment.text) ? (
                <Center>
                  <VStack gap={0} className="w-full max-w-4xl">
                    <Text
                      type="code"
                      className="whitespace-pre-wrap wrap-anywhere"
                    >
                      {attachment.text || "Empty document"}
                    </Text>
                  </VStack>
                </Center>
              ) : attachment.mimeType.startsWith("video/") && previewUrl ? (
                <Center className="min-h-[60dvh]">
                  <video
                    src={previewUrl}
                    controls
                    className="max-h-[75dvh] max-w-full"
                  />
                </Center>
              ) : attachment.mimeType.startsWith("audio/") && previewUrl ? (
                <Center className="min-h-[40dvh]">
                  <audio src={previewUrl} controls />
                </Center>
              ) : (
                <Center className="min-h-[40dvh]">
                  <VStack gap={3} hAlign="center">
                    <FontAwesomeIcon
                      icon={faFile}
                      className="text-(--color-icon-secondary)"
                      size="2x"
                    />

                    <Text type="supporting" color="secondary">
                      {previewUrl
                        ? "Preview is not available for this file. Download to view it."
                        : "This file is no longer available."}
                    </Text>
                  </VStack>
                </Center>
              )}
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
