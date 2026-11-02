import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrophone, faStop } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import type { TranscribeError, TranscribeStatus } from "../transcribe-recorder";

interface Props {
  status: TranscribeStatus;
  error: TranscribeError | null;
  onToggle: () => void;
  onDismissError: () => void;
}

export function ComposerTranscribeButton(props: Props) {
  const busy = props.status === "starting" || props.status === "stopping";
  const recording = props.status === "recording";

  const label =
    props.status === "starting"
      ? "Starting transcription"
      : props.status === "stopping"
        ? "Stopping transcription"
        : recording
          ? "Stop transcription"
          : "Transcribe voice input";

  function dismiss(isOpen: boolean) {
    if (!isOpen) {
      props.onDismissError();
    }
  }

  return (
    <>
      <Button
        label={label}
        size="sm"
        variant="ghost"
        isIconOnly
        isDisabled={busy}
        isLoading={busy}
        className={
          recording
            ? "bg-(--color-background-red)! text-(--color-text-red)!"
            : "hover:bg-(--color-background-red)! hover:text-(--color-text-red)!"
        }
        icon={<FontAwesomeIcon icon={recording ? faStop : faMicrophone} />}
        clickAction={props.onToggle}
      />

      <Dialog
        isOpen={props.error !== null}
        onOpenChange={dismiss}
        purpose="info"
        width={400}
      >
        <Layout
          header={
            <DialogHeader
              title={props.error?.title || "Transcription"}
              onOpenChange={dismiss}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">{props.error?.description || ""}</Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Close" clickAction={props.onDismissError} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
