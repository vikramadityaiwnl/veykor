import {
  BoltIcon,
  EyeIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import type { ChatPermission } from "@veykor/shared";

interface Props {
  permission: ChatPermission;
}

function PermissionIcon(props: Props) {
  if (props.permission === "full-access") {
    return <BoltIcon className="size-4 shrink-0 text-red-400" />;
  }

  if (props.permission === "approved") {
    return <ShieldCheckIcon className="size-4 shrink-0 text-zinc-400" />;
  }

  return <EyeIcon className="size-4 shrink-0 text-zinc-400" />;
}

export default PermissionIcon;
