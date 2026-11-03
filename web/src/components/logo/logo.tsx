interface Props {
  size?: number;
}

function Logo(props: Props) {
  const size = props.size ?? 32;

  return (
    <img
      alt="veykor"
      className="invert light:invert-0"
      height={size}
      src="/logo.svg"
      width={size}
    />
  );
}

export default Logo;
