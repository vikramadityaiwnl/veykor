import { useState } from "react";
import type { SidebarSection } from "@veykor/shared";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";

export type SectionDialogState =
  { mode: "create" } | { mode: "edit"; section: SidebarSection };

interface Props {
  dialog: SectionDialogState | null;
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    kind: "chats" | "projects";
  }) => Promise<boolean>;
}

export function SectionFormDialog(props: Props) {
  const [title, setTitle] = useState(() =>
    props.dialog?.mode === "edit" ? props.dialog.section.title : "",
  );
  const [kind, setKind] = useState<"chats" | "projects">("chats");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = props.dialog?.mode === "edit";
  const dialogTitle = isEdit ? "Edit section" : "New section";
  const actionLabel = isEdit ? "Save" : "Create";
  const isValid = title.trim().length > 0;

  async function submit() {
    if (!isValid || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const saved = await props.onSubmit({ title: title.trim(), kind });

      if (saved) {
        props.onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      isOpen={props.dialog !== null}
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
            title={dialogTitle}
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
                label="Section title"
                value={title}
                onChange={setTitle}
                placeholder="e.g. Research"
                hasAutoFocus
                onEnter={() => {
                  void submit();
                }}
              />
              {isEdit ? null : (
                <VStack gap={2}>
                  <Text type="body">Type</Text>
                  <SegmentedControl
                    value={kind}
                    onChange={(value) => {
                      setKind(value === "projects" ? "projects" : "chats");
                    }}
                    label="Section type"
                    layout="fill"
                  >
                    <SegmentedControlItem value="chats" label="Chats" />
                    <SegmentedControlItem value="projects" label="Projects" />
                  </SegmentedControl>
                </VStack>
              )}
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
                label={actionLabel}
                variant="primary"
                isDisabled={!isValid}
                isLoading={isSubmitting}
                clickAction={submit}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
