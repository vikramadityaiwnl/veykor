import type { ChatModel, ChatProvider } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCube } from "@fortawesome/free-solid-svg-icons";
import { Selector } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/VStack";
import { ChatProviderIcon } from "./chat-provider-icon";

interface Props {
  providers: ChatProvider[];
  providerId: string;
  modelId: string;
  preferredModels: Record<string, string>;
  loading: boolean;
  onSelection: (providerId: string, modelId: string) => void;
  isCompact?: boolean;
}

function humanizeModelName(value: string): string {
  return value
    .split(/[-_]/)
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function formatPrice(value: number): string {
  if (Number.isInteger(value)) {
    return `$${value}`;
  }

  return `$${value.toFixed(2)}`;
}

function formatCompactCount(value: number): string {
  const unit =
    value >= 1_000_000
      ? { divisor: 1_000_000, suffix: "M" }
      : value >= 1_000
        ? { divisor: 1_000, suffix: "K" }
        : null;

  if (!unit) {
    return `${value}`;
  }

  const scaled = Math.round((value / unit.divisor) * 10) / 10;

  return `${scaled}${unit.suffix}`;
}

function modelDescription(model: ChatModel): string | undefined {
  const parts: string[] = [];

  if (model.pricingAvailable) {
    const cached =
      model.cachedPrice > 0 ? ` / ${formatPrice(model.cachedPrice)}` : "";

    parts.push(
      `${formatPrice(model.inputPrice)}${cached} / ${formatPrice(model.outputPrice)}`,
    );
  }

  if (model.contextWindow > 0) {
    parts.push(formatCompactCount(model.contextWindow));
  }

  if (parts.length > 0) {
    return parts.join(" · ");
  }

  return model.description || undefined;
}

export function ComposerModelSelection(props: Props) {
  const available = props.providers.filter((entry) => entry.available);
  const provider =
    available.find((entry) => entry.id === props.providerId) ||
    props.providers.find((entry) => entry.id === props.providerId);

  return (
    <VStack
      gap={4}
      className={props.isCompact ? "" : "flex-row! items-center gap-1!"}
    >
      <Selector
        startIcon={<ChatProviderIcon providerId={props.providerId} />}
        label="Provider"
        isLabelHidden={!props.isCompact}
        variant={props.isCompact ? "input" : "ghost"}
        size="sm"
        placement={props.isCompact ? undefined : "above"}
        controlClassName={
          props.isCompact ? undefined : "veykor-collapsed-trigger"
        }
        renderValue={
          props.isCompact
            ? undefined
            : (option) => (
                <span className="veykor-collapsed-label">{option.label}</span>
              )
        }
        value={props.providerId}
        isLoading={props.loading}
        emptyText="No providers available"
        options={available.map((entry) => ({
          value: entry.id,
          label: entry.name,
          icon: <ChatProviderIcon providerId={entry.id} />,
        }))}
        onChange={(id) => {
          const next = available.find((entry) => entry.id === id);
          const preferred = props.preferredModels[id];
          const model =
            (preferred &&
              next?.models.find((entry) => entry.id === preferred)?.id) ||
            next?.models[0]?.id ||
            "";

          props.onSelection(id, model);
        }}
      />
      <Selector
        startIcon={<FontAwesomeIcon icon={faCube} />}
        label="Model"
        isLabelHidden={!props.isCompact}
        variant={props.isCompact ? "input" : "ghost"}
        size="sm"
        placement={props.isCompact ? undefined : "above"}
        controlClassName={
          props.isCompact ? undefined : "veykor-collapsed-trigger"
        }
        renderValue={
          props.isCompact
            ? undefined
            : (option) => (
                <span className="veykor-collapsed-label">{option.label}</span>
              )
        }
        hasSearch
        value={props.modelId}
        options={(provider?.models || []).map((entry) => ({
          value: entry.id,
          label: humanizeModelName(entry.name),
          description: modelDescription(entry),
          icon: <FontAwesomeIcon icon={faCube} />,
        }))}
        emptyText="No models available"
        onChange={(id) => props.onSelection(props.providerId, id)}
      />
    </VStack>
  );
}
