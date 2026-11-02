import type { DetectedSkill } from "@veykor/shared";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  skill: DetectedSkill;
  isBusy: boolean;
  onView: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

export function DetectedSkillRow(props: Props) {
  return (
    <HStack gap={4} vAlign="center" justify="between" wrap="wrap" padding={4}>
      <VStack gap={1} className="min-w-0 flex-1">
        <Heading level={3} weight="semibold">
          {props.skill.name}
        </Heading>

        {props.skill.description ? (
          <Text type="supporting" color="secondary" maxLines={2}>
            {props.skill.description}
          </Text>
        ) : null}

        <Text type="supporting" color="secondary" maxLines={1}>
          {props.skill.path}
        </Text>
      </VStack>

      <HStack gap={3} vAlign="center" wrap="wrap">
        <Button
          label="View"
          variant="secondary"
          size="sm"
          isDisabled={props.isBusy}
          clickAction={props.onView}
        />

        <Button
          label="Download"
          variant="ghost"
          size="sm"
          isDisabled={props.isBusy}
          clickAction={props.onDownload}
        />

        <Button
          label="Edit"
          variant="ghost"
          size="sm"
          isDisabled={props.isBusy}
          clickAction={props.onEdit}
        />

        <Button
          label="Delete"
          variant="ghost"
          size="sm"
          isDisabled={props.isBusy}
          clickAction={props.onRemove}
        />
      </HStack>
    </HStack>
  );
}
