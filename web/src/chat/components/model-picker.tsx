import { CubeIcon } from "@heroicons/react/24/outline";
import { modelDisplayName } from "@veykor/shared";
import Selector from "../../components/selector/selector.tsx";
import { useChatStore } from "../chat-store.ts";

function ModelPicker() {
  const { modelId, providerId, catalog, setModel } = useChatStore();
  const models = catalog?.models ?? [];

  return (
    <Selector
      label="Select model"
      variant="composer"
      menuWidth={360}
      placeholder="Select model"
      disabled={catalog === null}
      value={`${providerId}:${modelId}`}
      options={models.map((model) => ({
        value: `${model.providerId}:${model.modelId}`,
        label: modelDisplayName(model.modelId, model.displayLabel),
        description: [
          model.description,
          model.cost
            ? `$${model.cost.input} / $${model.cost.cached} / $${model.cost.output} · 1M`
            : model.providerId,
        ]
          .filter(Boolean)
          .join(" · "),
        icon: <CubeIcon className="size-4 shrink-0 text-zinc-400" />,
      }))}
      onChange={(value) => {
        const model = models.find(
          (entry) => `${entry.providerId}:${entry.modelId}` === value,
        );

        if (model) {
          setModel(model.modelId, model.providerId);
        }
      }}
    />
  );
}

export default ModelPicker;
