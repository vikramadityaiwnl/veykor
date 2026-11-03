interface Props {
  text?: string;
}

function Divider(props: Props) {
  if (props.text === undefined || props.text === "") {
    return <div aria-hidden="true" className="h-px bg-zinc-800" />;
  }

  return (
    <div className="flex items-center gap-3" role="separator">
      <div aria-hidden="true" className="h-px flex-1 bg-zinc-800" />

      <span className="text-xs font-light text-zinc-500">{props.text}</span>

      <div aria-hidden="true" className="h-px flex-1 bg-zinc-800" />
    </div>
  );
}

export default Divider;
