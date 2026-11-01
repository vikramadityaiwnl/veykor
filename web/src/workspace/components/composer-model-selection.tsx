import type { ChatProvider } from "@veykor/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCube } from "@fortawesome/free-solid-svg-icons";
import { Selector } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/VStack";
import { ChatProviderIcon } from "./chat-provider-icon";

interface Props {
  providers: ChatProvider[];
  providerId: string;
  modelId: string;
  loading: boolean;
  onSelection: (providerId: string, modelId: string) => void;
  isCompact?: boolean;
}

export function ComposerModelSelection(props: Props) {
  const provider = props.providers.find(
    (entry) => entry.id === props.providerId,
  );

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
        value={props.providerId}
        isLoading={props.loading}
        options={props.providers
          .filter((entry) => entry.available)
          .map((entry) => ({
            value: entry.id,
            label: entry.name,
            icon: <ChatProviderIcon providerId={entry.id} />,
          }))}
        onChange={(id) =>
          props.onSelection(
            id,
            props.providers.find((entry) => entry.id === id)?.models[0]?.id ||
              "",
          )
        }
      />
      <Selector
        startIcon={<FontAwesomeIcon icon={faCube} />}
        label="Model"
        isLabelHidden={!props.isCompact}
        variant={props.isCompact ? "input" : "ghost"}
        size="sm"
        hasSearch
        value={props.modelId}
        options={(provider?.models || []).map((entry) => ({
          value: entry.id,
          label: entry.name,
          icon: <FontAwesomeIcon icon={faCube} />,
        }))}
        emptyText="No models available"
        onChange={(id) => props.onSelection(props.providerId, id)}
      />
    </VStack>
  );
}
