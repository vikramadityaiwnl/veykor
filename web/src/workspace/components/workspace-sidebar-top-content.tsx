import { useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExpand, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Kbd } from "@astryxdesign/core/Kbd";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useHotkeys } from "@astryxdesign/core/hooks";

interface Props {
  isCollapsed: boolean;
  isCommandPaletteOpen: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onExpandSidebar: () => void;
  onOpenCommandPalette: () => void;
}

export function WorkspaceSidebarTopContent(props: Props) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useHotkeys([
    {
      keys: "mod+k",
      allowInInputs: true,
      isDisabled: props.isCommandPaletteOpen,
      onPress: () => {
        if (props.isCollapsed) {
          props.onOpenCommandPalette();
          return;
        }

        searchInputRef.current?.focus();
      },
    },
  ]);

  if (props.isCollapsed) {
    return (
      <VStack gap={1} hAlign="center">
        <Button
          label="Expand sidebar"
          isIconOnly
          variant="ghost"
          icon={<FontAwesomeIcon icon={faExpand} aria-hidden="true" />}
          clickAction={props.onExpandSidebar}
        />
        <Button
          label="Search"
          isIconOnly
          variant="ghost"
          icon={<FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />}
          clickAction={props.onOpenCommandPalette}
        />
      </VStack>
    );
  }

  return (
    <VStack gap={2} paddingBlockStart={2}>
      <HStack className="group/search relative" vAlign="center">
        <TextInput
          ref={searchInputRef}
          label="Search"
          isLabelHidden
          placeholder="Search"
          value={props.query}
          onChange={props.onQueryChange}
          startIcon={
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="text-(--color-icon-secondary) transition-colors group-focus-within/search:text-(--color-icon-primary)"
              aria-hidden="true"
            />
          }
          width="100%"
        />
        <Kbd
          keys="mod+k"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
        />
      </HStack>{" "}
    </VStack>
  );
}
