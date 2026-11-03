import { useNavigate } from "react-router";
import Logo from "../../components/logo/logo.tsx";
import { useChatStore } from "../chat-store.ts";

interface Props {
  [key: string]: never;
}

function ChatNotFound(_props: Props) {
  const navigate = useNavigate();
  const startDraft = useChatStore((state) => state.startDraft);

  function handleBack() {
    startDraft(useChatStore.getState().pendingSectionId);
    navigate("/");
  }

  return (
    <div className="grid h-full min-h-0 flex-1 place-items-center px-6 py-10">
      <div className="flex w-full max-w-xs flex-col items-center space-y-6 text-center">
        <Logo size={56} />

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-50">
            Chat not found
          </h1>

          <p className="text-sm font-light text-zinc-400">
            This chat was deleted or never existed. Start a new conversation
            instead.
          </p>
        </div>

        <button
          className="rounded-lg bg-zinc-100 px-8 py-2 font-semibold text-zinc-950 transition duration-200 hover:bg-white light:hover:bg-zinc-200"
          onClick={handleBack}
          type="button"
        >
          Back to chats
        </button>
      </div>
    </div>
  );
}

export default ChatNotFound;
