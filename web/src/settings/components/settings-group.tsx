import { Children, Fragment, type ReactNode } from "react";
import { Divider } from "@astryxdesign/core/Divider";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  children: ReactNode;
}

export function SettingsGroup(props: Props) {
  return (
    <VStack
      gap={0}
      className="w-full shrink-0 overflow-hidden rounded-(--radius-container) border border-solid border-(--color-border) bg-(--color-background-surface)"
    >
      {Children.toArray(props.children).map((child, index) => (
        <Fragment key={index}>
          {index > 0 && <Divider />}
          {child}
        </Fragment>
      ))}
    </VStack>
  );
}
