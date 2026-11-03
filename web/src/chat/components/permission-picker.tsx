import type { ChatPermission } from "@veykor/shared";
import { chatPermissions } from "@veykor/shared";
import Selector from "../../components/selector/selector.tsx";
import PermissionIcon from "./permission-icon.tsx";
import { useChatStore } from "../chat-store.ts";

function PermissionPicker() {
  const { permission, setPermission } = useChatStore();

  return (
    <Selector
      label="Permissions"
      variant="composer"
      menuWidth={300}
      value={permission}
      options={chatPermissions.map((entry) => ({
        value: entry.value,
        label: entry.title,
        description: entry.description,
        danger: entry.value === "full-access",
        icon: <PermissionIcon permission={entry.value} />,
      }))}
      onChange={(value) => setPermission(value as ChatPermission)}
    />
  );
}

export default PermissionPicker;
