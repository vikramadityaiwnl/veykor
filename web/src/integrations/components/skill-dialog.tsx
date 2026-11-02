import { useEffect, useState } from "react";
import type { DetectedSkill, SkillDetail } from "@veykor/shared";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useSkillsStore } from "../skills-store";

export type SkillDialogMode =
  | { kind: "create" }
  | { kind: "view"; skill: DetectedSkill }
  | { kind: "edit"; skill: DetectedSkill };

interface Props {
  mode: SkillDialogMode;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (skill: DetectedSkill) => void;
  onDownload: (skill: DetectedSkill) => void;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function SkillDialog(props: Props) {
  const mode = props.mode;
  const skill = mode.kind === "create" ? null : mode.skill;

  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [name, setName] = useState(skill?.name || "");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(mode.kind !== "create");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchDetail = useSkillsStore((state) => state.fetchDetail);
  const createSkill = useSkillsStore((state) => state.createSkill);
  const updateSkill = useSkillsStore((state) => state.updateSkill);

  useEffect(() => {
    if (mode.kind === "create") {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError("");

    fetchDetail(mode.skill.id).then(
      (loaded) => {
        if (cancelled) {
          return;
        }

        setDetail(loaded);
        setName(loaded.name);
        setDescription(loaded.description);
        setBody(loaded.body.trim());
        setIsLoading(false);
      },
      (requestError: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load this skill.",
        );
        setIsLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [fetchDetail, mode]);

  function valid(): boolean {
    if (!NAME_PATTERN.test(name.trim())) {
      return false;
    }

    if (description.trim().length === 0) {
      return false;
    }

    return body.trim().length > 0;
  }

  async function save() {
    if (!valid() || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      if (mode.kind === "edit") {
        await updateSkill(mode.skill.id, {
          name: name.trim(),
          description: description.trim(),
          body: `${body.trim()}\n`,
        });
      } else {
        await createSkill({
          name: name.trim(),
          description: description.trim(),
          body: `${body.trim()}\n`,
        });
      }

      props.onClose();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save this skill.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function close() {
    props.onClose();
  }

  if (mode.kind === "view") {
    return (
      <Dialog
        isOpen={props.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            close();
          }
        }}
        purpose="info"
        width={640}
      >
        <Layout
          header={
            <DialogHeader
              title={skill?.name || "Skill"}
              onOpenChange={(isOpen) => {
                if (!isOpen) {
                  close();
                }
              }}
            />
          }
          content={
            <LayoutContent>
              {isLoading ? (
                <Spinner label="Loading skill…" />
              ) : error ? (
                <Banner status="error" title={error} />
              ) : (
                <VStack gap={4}>
                  {detail?.description ? (
                    <Text color="secondary">{detail.description}</Text>
                  ) : null}

                  <Text
                    type="code"
                    className="whitespace-pre-wrap wrap-anywhere"
                  >
                    {detail?.body.trim() || ""}
                  </Text>

                  <Text type="supporting" color="secondary">
                    {detail?.path || ""}
                  </Text>
                </VStack>
              )}
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end" wrap="wrap">
                <Button label="Close" variant="ghost" clickAction={close} />

                <Button
                  label="Download"
                  variant="secondary"
                  clickAction={() => {
                    if (skill) {
                      props.onDownload(skill);
                    }
                  }}
                />

                <Button
                  label="Edit"
                  variant="primary"
                  clickAction={() => {
                    if (skill) {
                      props.onEdit(skill);
                    }
                  }}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    );
  }

  return (
    <Dialog
      isOpen={props.isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          close();
        }
      }}
      purpose="form"
      width={640}
    >
      <Layout
        header={
          <DialogHeader
            title={mode.kind === "edit" ? "Edit skill" : "Add skill"}
            onOpenChange={(isOpen) => {
              if (!isOpen) {
                close();
              }
            }}
          />
        }
        content={
          <LayoutContent>
            {isLoading ? (
              <Spinner label="Loading skill…" />
            ) : (
              <VStack gap={4}>
                <TextInput
                  label="Name"
                  value={name}
                  onChange={setName}
                  placeholder="e.g. pdf-reader"
                  description="Lowercase letters, numbers and hyphens."
                  hasAutoFocus
                />

                <TextInput
                  label="Description"
                  value={description}
                  onChange={setDescription}
                  placeholder="What this skill teaches your agents"
                />

                <TextArea
                  label="Instructions"
                  value={body}
                  onChange={setBody}
                  rows={12}
                  placeholder="Markdown instructions your agents follow when this skill applies"
                />

                {error ? <Banner status="error" title={error} /> : null}
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end" wrap="wrap">
              <Button label="Cancel" variant="ghost" clickAction={close} />

              <Button
                label={mode.kind === "edit" ? "Save" : "Add"}
                variant="primary"
                isDisabled={!valid()}
                isLoading={isSaving}
                clickAction={save}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
