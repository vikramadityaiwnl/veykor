interface Props {
  text: string;
}

function Badge(props: Props) {
  return (
    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
      {props.text}
    </span>
  );
}

export default Badge;
