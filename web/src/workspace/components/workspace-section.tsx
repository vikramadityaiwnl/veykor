import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import type { SidebarSection } from "@veykor/shared";
import { Button } from "@astryxdesign/core/Button";
import { ContextMenu, type ContextMenuOption } from "@astryxdesign/core/ContextMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";

interface Props {
  section: SidebarSection;
  onToggle: () => void;
  onAdd?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  children: ReactNode;
}

export function WorkspaceSection(props: Props) {
  const listId = `workspace-section-${props.section.id}`;

  const editItem: ContextMenuOption = {
    label: "Edit",
    icon: <FontAwesomeIcon icon={faPen} size="sm" aria-hidden="true" />,
    onClick: () => {
      props.onEdit();
    },
  };

  const deleteItems: ContextMenuOption[] = props.section.isFixed
    ? []
    : [
        { type: "divider" },
        {
          label: "Delete",
          variant: "destructive",
          icon: <FontAwesomeIcon icon={faTrash} size="sm" aria-hidden="true" />,
          onClick: () => {
            props.onDelete();
          },
        },
      ];

  return (
    <VStack gap={1}>
      <ContextMenu
        label={`${props.section.title} actions`}
        onContextMenu={(event) => {
          event.stopPropagation();
        }}
        onTouchStart={(event) => {
          event.stopPropagation();
        }}
        items={[editItem, ...deleteItems]}
      >
        <HStack gap={1} vAlign="center" className="group">
          <Button
            label={props.section.title}
            variant="ghost"
            size="sm"
            className="flex-1 !justify-start !bg-transparent !ps-(--spacing-2) !text-(--text-label-size) hover:!bg-none active:!bg-none"
            aria-expanded={props.section.isExpanded}
            aria-controls={props.section.isExpanded ? listId : undefined}
            onClick={props.onToggle}
          />
          {props.onAdd ? (
            <Button
              label={`Add to ${props.section.title}`}
              isIconOnly
              variant="secondary"
              size="sm"
              className="!border-0 !bg-transparent !shadow-none text-(--color-icon-secondary) opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:!bg-none hover:text-(--color-text-primary) active:!bg-none [@media(hover:none)]:opacity-100"
              icon={
                <FontAwesomeIcon icon={faPlus} size="xs" aria-hidden="true" />
              }
              clickAction={props.onAdd}
            />
          ) : null}
        </HStack>
      </ContextMenu>
      {props.section.isExpanded ? (
        <VStack
          id={listId}
          role="group"
          aria-label={props.section.title}
          gap={1}
        >
          {props.children}
        </VStack>
      ) : null}
    </VStack>
  );
}
