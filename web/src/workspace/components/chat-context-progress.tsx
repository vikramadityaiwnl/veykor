interface Props {
  tokens: number;
  limit: number;
}

const radius = 8;
const circumference = 2 * Math.PI * radius;

export function ChatContextProgress(props: Props) {
  const used = Math.min(Math.max(props.tokens, 0), props.limit);
  const percent = (used / props.limit) * 100;
  const description = `${used.toLocaleString()} / ${props.limit.toLocaleString()} tokens (${percent.toFixed(1)}%)`;

  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      role="progressbar"
      aria-label="Estimated context usage"
      aria-valuemin={0}
      aria-valuemax={props.limit}
      aria-valuenow={used}
      aria-valuetext={description}
      className="shrink-0"
    >
      <title>{description}</title>
      <circle
        cx={10}
        cy={10}
        r={radius}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={2.5}
      />
      <circle
        cx={10}
        cy={10}
        r={radius}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - used / props.limit)}
        transform="rotate(-90 10 10)"
      />
    </svg>
  );
}
