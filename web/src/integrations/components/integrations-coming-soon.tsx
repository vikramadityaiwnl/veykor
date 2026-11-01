import type { ReactNode } from "react";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  title: string;
  description: string;
  icon: ReactNode;
  panelId: string;
}

export function IntegrationsComingSoon(props: Props) {
  return (
    <VStack
      id={props.panelId}
      isScrollable
      className="min-h-0 flex-1 overscroll-contain"
    >
      <Center className="min-h-full shrink-0">
        <EmptyState
          title={props.title}
          description={props.description}
          icon={props.icon}
        />
      </Center>
    </VStack>
  );
}
