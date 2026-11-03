import { PhotoIcon } from "@heroicons/react/24/outline";

interface Props {
  label?: string;
}

function MissingAttachment(props: Props) {
  return (
    <div className="flex w-40 flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 px-4 py-6 text-center">
      <PhotoIcon aria-hidden="true" className="size-6 text-zinc-600" />

      <p className="text-xs font-light text-zinc-500">
        {props.label ?? "Image not found"}
      </p>
    </div>
  );
}

export default MissingAttachment;
