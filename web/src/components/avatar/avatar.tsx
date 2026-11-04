import { avatarInitials } from "./avatar-initials.ts";

interface Props {
  name: string;
  size?: number;
}

function Avatar(props: Props) {
  const size = props.size ?? 32;
  const initials = avatarInitials(props.name);
  const fontSize = Math.max(size * 0.375, 10);

  return (
    <div
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-zinc-100 font-semibold text-zinc-950"
      style={{ fontSize, height: size, width: size }}
    >
      {initials}
    </div>
  );
}

export default Avatar;
