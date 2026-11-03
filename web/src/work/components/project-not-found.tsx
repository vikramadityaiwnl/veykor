import { useNavigate } from "react-router";
import Logo from "../../components/logo/logo.tsx";
import { useChatStore } from "../../chat/chat-store.ts";
import { useWorkStore } from "../work-store.ts";

interface Props {
  [key: string]: never;
}

function ProjectNotFound(_props: Props) {
  const navigate = useNavigate();
  const startDraft = useChatStore((state) => state.startDraft);

  function handleBack() {
    useWorkStore.getState().selectProject("");
    startDraft(useChatStore.getState().pendingSectionId);
    navigate("/work");
  }

  return (
    <div className="grid h-full min-h-0 flex-1 place-items-center px-6 py-10">
      <div className="flex w-full max-w-xs flex-col items-center space-y-6 text-center">
        <Logo size={56} />

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-50">
            Project not found
          </h1>

          <p className="text-sm font-light text-zinc-400">
            This project was deleted or never existed. Choose another project
            instead.
          </p>
        </div>

        <button
          className="rounded-lg bg-zinc-100 px-8 py-2 font-semibold text-zinc-950 transition duration-200 hover:bg-white light:hover:bg-zinc-200"
          onClick={handleBack}
          type="button"
        >
          Back to work
        </button>
      </div>
    </div>
  );
}

export default ProjectNotFound;
