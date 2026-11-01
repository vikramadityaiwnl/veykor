import type { DetectedSkill } from "@veykor/shared";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  skill: DetectedSkill;
}

export function DetectedSkillRow(props: Props) {
  return (
    <VStack gap={1} padding={4} className="min-w-0">
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
  );
}
