import { useState } from "react";
import type { MouseEvent } from "react";
import {
  ArrowRightStartOnRectangleIcon,
  ChevronUpDownIcon,
} from "@heroicons/react/24/solid";
import Avatar from "../avatar/avatar.tsx";
import Popover from "../popover/popover.tsx";

interface Props {
  description: string;
  name: string;
  onSignOut: () => void;
  signingOut: boolean;
}

function ProfileCard(props: Props) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  function handleToggle(event: MouseEvent<HTMLButtonElement>) {
    if (anchorRect !== null) {
      setAnchorRect(null);
      return;
    }

    setAnchorRect(event.currentTarget.getBoundingClientRect());
  }

  return (
    <div>
      <button
        aria-expanded={anchorRect !== null}
        aria-haspopup="menu"
        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-zinc-900"
        onClick={handleToggle}
        type="button"
      >
        <Avatar name={props.name} size={32} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-50">
            {props.name}
          </p>

          <p className="truncate text-xs font-light text-zinc-500">
            {props.description}
          </p>
        </div>

        <ChevronUpDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-zinc-500"
        />
      </button>

      {anchorRect !== null && (
        <Popover anchorRect={anchorRect} onClose={() => setAnchorRect(null)}>
          <button
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-light text-rose-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={props.signingOut}
            onClick={props.onSignOut}
            role="menuitem"
            type="button"
          >
            <ArrowRightStartOnRectangleIcon
              aria-hidden="true"
              className="size-4"
            />

            {props.signingOut ? "Signing out..." : "Sign out"}
          </button>
        </Popover>
      )}
    </div>
  );
}

export default ProfileCard;
