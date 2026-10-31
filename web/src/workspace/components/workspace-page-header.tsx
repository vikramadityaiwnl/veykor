import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  title: string;
  description: string;
}

export function WorkspacePageHeader(props: Props) {
  return (
    <VStack gap={1} className="shrink-0">
      <Heading level={1} weight="semibold">
        {props.title}
      </Heading>

      <Text color="secondary">{props.description}</Text>
    </VStack>
  );
}
