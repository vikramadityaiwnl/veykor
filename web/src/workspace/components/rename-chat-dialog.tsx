import { useState } from "react";
import type { ChatSession } from "../chat-sessions-store";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";

interface Props {
  session: ChatSession | null;
  onClose: () => void;
  onSubmit: (name: string) => Promise<boolean>;
}

export function RenameChatDialog(props: Props) {
  const [name, setName] = useState(() => props.session?.title ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (props.session === null) {
    return null;
  }

  const isValid = name.trim().length > 0 && name.trim().length <= 200;

  async function submit() {
    if (!isValid || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const saved = await props.onSubmit(name.trim());

      if (saved) {
        props.onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      isOpen
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
            title={`Rename "${props.session.title}"`}
            onOpenChange={(isOpen) => {
              if (!isOpen) {
                props.onClose();
              }
            }}
          />
        }
        content={
          <LayoutContent>
            <TextInput
              label="Chat title"
              value={name}
              onChange={setName}
              hasAutoFocus
              onEnter={() => {
                void submit();
              }}
            />
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
                label="Save"
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
