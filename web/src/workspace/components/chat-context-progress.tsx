import { ProgressBar } from "@astryxdesign/core/ProgressBar";

interface Props {
  tokens: number;
  limit: number;
}

export function ChatContextProgress(props: Props) {
  const used = Math.min(Math.max(props.tokens, 0), props.limit);
  const percent = ((used / props.limit) * 100).toFixed(1);
  const description = `${used.toLocaleString()} / ${props.limit.toLocaleString()} tokens (${percent}%) · estimated from the last reply`;

  return (
    <ProgressBar
      label="Estimated context usage"
      isLabelHidden
      value={used}
      max={props.limit}
      formatValueLabel={() => description}
      className="w-24! [&_[role=progressbar]]:relative! [&_[role=progressbar]]:overflow-hidden! [&_.astryx-progress-bar-fill]:max-w-full! [&_.astryx-progress-bar-fill]:min-w-0!"
    />
  );
}
