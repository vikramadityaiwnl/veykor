import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComment, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TopNav } from "@astryxdesign/core/TopNav";
import { chatMenuItems } from "../chat-menu-items";

interface Props {
  title: string;
  onRename?: () => void;
  onDelete?: () => void;
}

export function ChatThreadHeader(props: Props) {
  return (
    <TopNav
      label="Chat"
      className="shrink-0 px-6! py-4! md:px-8!"
      startContent={
        <HStack gap={2} vAlign="center">
          <FontAwesomeIcon icon={faComment} aria-hidden="true" />
          <HStack className="min-w-0 max-w-lg" vAlign="center">
            <Text
              weight="semibold"
              className="truncate"
              onDoubleClick={
                props.onRename
                  ? (event) => {
                      event.preventDefault();
                      props.onRename?.();
                    }
                  : undefined
              }
            >
              {props.title}
            </Text>
          </HStack>
        </HStack>
      }
      endContent={
        props.onRename && props.onDelete ? (
          <DropdownMenu
            button={{
              label: "Chat actions",
              variant: "ghost",
              isIconOnly: true,
              icon: <FontAwesomeIcon icon={faEllipsis} aria-hidden="true" />,
            }}
            hasChevron={false}
            items={chatMenuItems(props.onRename, props.onDelete)}
          />
        ) : undefined
      }
    />
  );
}
