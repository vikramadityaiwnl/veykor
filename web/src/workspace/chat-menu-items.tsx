import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";

export function chatMenuItems(onRename: () => void, onDelete: () => void) {
  return [
    {
      label: "Rename chat",
      icon: <FontAwesomeIcon icon={faPen} aria-hidden="true" />,
      onClick: onRename,
    },
    {
      label: "Delete chat",
      icon: <FontAwesomeIcon icon={faTrash} aria-hidden="true" />,
      variant: "destructive" as const,
      onClick: onDelete,
    },
  ];
}
