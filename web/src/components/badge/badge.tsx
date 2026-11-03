interface Props {
  text: string;
  tone?: "neutral" | "success" | "danger";
}

const tones = {
  neutral: "border-zinc-800 bg-zinc-900 text-zinc-500",
  success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400",
  danger: "border-red-400/30 bg-red-400/10 text-red-400",
} as const;

function Badge(props: Props) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[props.tone ?? "neutral"]}`}
    >
      {props.text}
    </span>
  );
}

export default Badge;
