import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";

interface PickerWindow extends Window {
  showDirectoryPicker?: () => Promise<{ name: string }>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; folder: string }) => Promise<boolean>;
}

export function AddProjectDialog(props: Props) {
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const isValid = name.trim().length > 0 && folder.trim().length > 0;

  async function pickFolder() {
    const picker = (window as PickerWindow).showDirectoryPicker;

    if (picker) {
      try {
        const handle = await picker();

        setFolder(handle.name);
        setName((current) => (current.trim() ? current : handle.name));
      } catch {
        return;
      }

      return;
    }

    folderInputRef.current?.click();
  }

  function pickFolderFallback(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const relative =
      (file as (File & { webkitRelativePath?: string }) | undefined)
        ?.webkitRelativePath ?? "";

    const folderName = relative.split("/")[0] || file?.name || "";

    setFolder(folderName);
    setName((current) => (current.trim() ? current : folderName));
    event.currentTarget.value = "";
  }

  async function submit() {
    if (!isValid || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const saved = await props.onSubmit({
        name: name.trim(),
        folder: folder.trim(),
      });

      if (saved) {
        props.onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      isOpen={props.isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          props.onClose();
        }
      }}
      purpose="form"
      width={400}
    >
      <Layout
        header={
          <DialogHeader
            title="New project"
            onOpenChange={(isOpen) => {
              if (!isOpen) {
                props.onClose();
              }
            }}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              <TextInput
                label="Project name"
                value={name}
                onChange={setName}
                placeholder="e.g. Website"
                hasAutoFocus
                onEnter={() => {
                  void submit();
                }}
              />
              <VStack gap={2}>
                <HStack gap={2} vAlign="center">
                  <Text type="body">Folder</Text>
                  <Button
                    label="Choose folder"
                    variant="secondary"
                    size="sm"
                    clickAction={pickFolder}
                  />
                </HStack>
                <Text type="supporting" color="secondary">
                  {folder || "No folder selected"}
                </Text>
              </VStack>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button
                label="Cancel"
                variant="secondary"
                clickAction={props.onClose}
              />
              <Button
                label="Create"
                variant="primary"
                isDisabled={!isValid}
                isLoading={isSubmitting}
                clickAction={submit}
              />
            </HStack>
          </LayoutFooter>
        }
      />
      <input
        ref={folderInputRef}
        type="file"
        aria-label="Project folder"
        onChange={pickFolderFallback}
        hidden
        {...{ webkitdirectory: "" }}
      />
    </Dialog>
  );
}
