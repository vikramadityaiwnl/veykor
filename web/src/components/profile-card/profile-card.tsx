import { useState } from "react";
import {
  ArrowRightStartOnRectangleIcon,
  ChevronUpDownIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  PuzzlePieceIcon,
  SparklesIcon,
  UserIcon,
} from "@heroicons/react/24/solid";
import { useNavigate } from "react-router";
import AlertDialog from "../alert-dialog/alert-dialog.tsx";
import Avatar from "../avatar/avatar.tsx";
import Dropdown from "../dropdown/dropdown.tsx";

interface Props {
  description: string;
  name: string;
  onSignOut: () => void;
  signingOut: boolean;
}

function ProfileCard(props: Props) {
  const navigate = useNavigate();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  return (
    <>
      <Dropdown
        label="Profile menu"
        trigger={
          <>
            <Avatar name={props.name} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-zinc-50">
                {props.name}
              </span>
              <span className="block truncate text-sm font-light text-zinc-500">
                {props.description}
              </span>
            </span>
            <ChevronUpDownIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-zinc-500"
            />
          </>
        }
        items={[
          {
            kind: "item",
            id: "agents",
            label: "Agents",
            icon: (
              <CpuChipIcon
                aria-hidden="true"
                className="size-4 text-zinc-400"
              />
            ),
            onSelect: () => navigate("/agents"),
          },
          {
            kind: "item",
            id: "integrations",
            label: "Integrations",
            icon: (
              <PuzzlePieceIcon
                aria-hidden="true"
                className="size-4 text-zinc-400"
              />
            ),
            onSelect: () => navigate("/integrations"),
          },
          {
            kind: "item",
            id: "memory",
            label: "Memory",
            icon: (
              <SparklesIcon
                aria-hidden="true"
                className="size-4 text-zinc-400"
              />
            ),
            onSelect: () => navigate("/memory"),
          },
          {
            kind: "item",
            id: "profile",
            label: "Profile",
            icon: (
              <UserIcon aria-hidden="true" className="size-4 text-zinc-400" />
            ),
            onSelect: () => navigate("/profile"),
          },
          {
            kind: "item",
            id: "settings",
            label: "Settings",
            icon: (
              <Cog6ToothIcon
                aria-hidden="true"
                className="size-4 text-zinc-400"
              />
            ),
            onSelect: () => navigate("/settings"),
          },
          { kind: "divider", id: "sign-out-divider" },
          {
            kind: "item",
            id: "sign-out",
            label: props.signingOut ? "Signing out…" : "Sign out",
            icon: (
              <ArrowRightStartOnRectangleIcon
                aria-hidden="true"
                className="size-4"
              />
            ),
            danger: true,
            disabled: props.signingOut,
            onSelect: () => setConfirmingSignOut(true),
          },
        ]}
      />
      {confirmingSignOut && (
        <AlertDialog
          confirmLabel="Sign out"
          danger={false}
          description="You will need to sign in again to access your workspace."
          onClose={() => setConfirmingSignOut(false)}
          onConfirm={props.onSignOut}
          title="Sign out"
        />
      )}
    </>
  );
}

export default ProfileCard;
