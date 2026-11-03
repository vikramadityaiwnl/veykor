import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import Selector from "../../components/selector/selector.tsx";
import { useChatStore } from "../chat-store.ts";

const fallbackEfforts = ["minimal", "low", "medium", "high", "xhigh", "max"];

function EffortPicker() {
  const { modelId, catalog, reasoningEffort, setReasoningEffort } =
    useChatStore();
  const model = catalog?.models.find((entry) => entry.modelId === modelId);
  const efforts =
    model && model.variants.length > 0 ? model.variants : fallbackEfforts;

  return (
    <Selector
      label="Thinking effort"
      variant="composer"
      disabled={catalog === null}
      value={reasoningEffort}
      options={[
        { value: "", label: "Auto" },
        ...efforts.map((value) => ({
          value,
          label: value.charAt(0).toUpperCase() + value.slice(1),
        })),
      ].map((option) => ({
        ...option,
        icon: <AdjustmentsHorizontalIcon className="size-4 shrink-0" />,
      }))}
      onChange={setReasoningEffort}
    />
  );
}

export default EffortPicker;
