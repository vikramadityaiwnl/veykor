import type { ChatHistoryItem } from "@veykor/shared";

interface Props {
  item: ChatHistoryItem;
}

function UserMessage(props: Props) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-2xl rounded-tl-md bg-zinc-800 px-4 py-2.5 text-sm font-light text-zinc-100 whitespace-pre-wrap break-words">
        {props.item.text}
      </div>
    </div>
  );
}

export default UserMessage;
