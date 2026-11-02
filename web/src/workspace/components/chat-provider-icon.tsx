import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTerminal } from "@fortawesome/free-solid-svg-icons";

interface Props {
  providerId: string;
}

export function ChatProviderIcon(props: Props) {
  if (!["muse", "opencode"].includes(props.providerId)) {
    return <FontAwesomeIcon icon={faTerminal} aria-hidden="true" />;
  }

  return (
    <img
      src={`/providers/${props.providerId}.svg`}
      alt=""
      className={`size-(--spacing-4) object-contain dark:invert`}
    />
  );
}
