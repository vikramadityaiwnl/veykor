import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import type { DetectedSkill } from "@veykor/shared";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { SettingsGroup } from "../../settings/components/settings-group";
import { useSkillsStore } from "../skills-store";
import { DetectedSkillRow } from "./detected-skill-row";
import { IntegrationsComingSoon } from "./integrations-coming-soon";
import { SkillDialog, type SkillDialogMode } from "./skill-dialog";

interface Props {
  panelId: string;
}

export function SkillsDetectedPanel(props: Props) {
  const sources = useSkillsStore((state) => state.sources);
  const status = useSkillsStore((state) => state.status);
  const busyKey = useSkillsStore((state) => state.busyKey);
  const error = useSkillsStore((state) => state.error);
  const load = useSkillsStore((state) => state.load);
  const refresh = useSkillsStore((state) => state.refresh);
  const fetchDetail = useSkillsStore((state) => state.fetchDetail);
  const removeSkill = useSkillsStore((state) => state.removeSkill);
  const clearError = useSkillsStore((state) => state.clearError);

  const [dialog, setDialog] = useState<SkillDialogMode | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DetectedSkill | null>(
    null,
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function download(skill: DetectedSkill) {
    clearError();

    try {
      const detail = await fetchDetail(skill.id);
      const blob = new Blob([detail.file], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `${detail.name}.md`;
      anchor.click();

      URL.revokeObjectURL(url);
    } catch (requestError) {
      useSkillsStore.setState({
        error:
          requestError instanceof Error
            ? requestError.message
            : "Unable to download this skill.",
      });
    }
  }

  async function confirmDelete(): Promise<boolean> {
    if (!pendingDelete) {
      return false;
    }

    try {
      await removeSkill(pendingDelete.id);
      setPendingDelete(null);

      return true;
    } catch {
      return false;
    }
  }

  if (status === "idle" || status === "loading") {
    return <Spinner label="Scanning for installed skills…" />;
  }

  if (status === "error") {
    return (
      <VStack gap={2}>
        <Banner
          status="error"
          title="Couldn't scan for installed skills"
          description="Please try again."
        />

        <HStack hAlign="start">
          <Button
            label="Try again"
            clickAction={() => {
              void refresh();
            }}
          />
        </HStack>
      </VStack>
    );
  }

  if (sources.length === 0) {
    return (
      <IntegrationsComingSoon
        panelId={props.panelId}
        title="No skills yet"
        description="Skills bundle reusable instructions your agents can call on. Add your own to get started."
        icon={
          <FontAwesomeIcon
            icon={faWandMagicSparkles}
            size="sm"
            className="size-(--spacing-10)! text-(--color-icon-secondary)"
            aria-hidden="true"
          />
        }
        actions={
          <Button
            label="Add skill"
            variant="primary"
            clickAction={() => setDialog({ kind: "create" })}
          />
        }
      />
    );
  }

  return (
    <VStack
      id={props.panelId}
      gap={4}
      isScrollable
      className="min-h-0 flex-1 overscroll-contain"
    >
      <Banner
        status="warning"
        title="Deleting here affects other apps"
        description="Skills live in folders on this host. Delete removes the skill's files; veykor keeps a backup beside the original."
      />

      <HStack hAlign="end">
        <Button
          label="Add skill"
          variant="primary"
          clickAction={() => setDialog({ kind: "create" })}
        />
      </HStack>

      {error ? (
        <Banner
          status="error"
          title={error}
          isDismissable
          onDismiss={clearError}
        />
      ) : null}

      {sources.map((source) => (
        <VStack key={source.id} gap={2} className="shrink-0">
          <VStack gap={1}>
            <Heading level={3} weight="semibold">
              {source.label}
            </Heading>

            <Text type="supporting" color="secondary" maxLines={1}>
              {source.path}
            </Text>
          </VStack>

          <SettingsGroup>
            {source.skills.map((skill) => (
              <DetectedSkillRow
                key={skill.id}
                skill={skill}
                isBusy={busyKey !== ""}
                onView={() => setDialog({ kind: "view", skill })}
                onDownload={() => {
                  void download(skill);
                }}
                onEdit={() => setDialog({ kind: "edit", skill })}
                onRemove={() => setPendingDelete(skill)}
              />
            ))}
          </SettingsGroup>
        </VStack>
      ))}

      {dialog ? (
        <SkillDialog
          key={
            dialog.kind === "create"
              ? "new"
              : `${dialog.kind}-${dialog.skill.id}`
          }
          mode={dialog}
          isOpen
          onClose={() => setDialog(null)}
          onEdit={(skill) => setDialog({ kind: "edit", skill })}
          onDownload={(skill) => {
            void download(skill);
          }}
        />
      ) : null}

      <AlertDialog
        isOpen={pendingDelete !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingDelete(null);
          }
        }}
        title={`Delete ${pendingDelete?.name || "skill"}?`}
        description="This removes the skill's files from this host. veykor keeps a backup beside the original."
        actionLabel="Delete"
        onAction={confirmDelete}
      />
    </VStack>
  );
}
