import { useEffect, useState } from "react";
import type { Project, ProjectContext } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCodeBranch, faFolder } from "@fortawesome/free-solid-svg-icons";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";

interface Props {
  project: Project;
}

export function ComposerProjectContext(props: Props) {
  const [context, setContext] = useState<ProjectContext>({
    branch: "",
    isWorktree: false,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(props.project.id)}/context`,
          { signal: controller.signal, credentials: "same-origin" },
        );

        if (response.ok) {
          const context: ProjectContext = await response.json();
          setContext(context);
        }
      } catch {
        return;
      }
    }

    void load();

    return () => controller.abort();
  }, [props.project.id]);

  return (
    <HStack
      gap={4}
      vAlign="center"
      justify="between"
      className="relative z-0 mx-1 -mt-4 min-w-0 border-x border-b border-solid border-(--color-border) rounded-b-(--radius-chat) bg-(--color-neutral) px-4 pt-7 pb-3 text-(--color-text-secondary) md:mx-4"
    >
      <HStack gap={2} vAlign="center" className="min-w-0 flex-1">
        <FontAwesomeIcon icon={faFolder} aria-hidden="true" />
        <Text color="inherit" maxLines={1}>
          {props.project.name}
        </Text>
      </HStack>
      {context.branch && (
        <HStack gap={2} vAlign="center" className="min-w-0 flex-1 justify-end">
          <FontAwesomeIcon icon={faCodeBranch} aria-hidden="true" />
          <Text color="inherit" maxLines={1}>
            {context.branch}
            {context.isWorktree ? " · Worktree" : ""}
          </Text>
        </HStack>
      )}
    </HStack>
  );
}
