import Avatar from "../../components/avatar/avatar.tsx";

interface Props {
  name: string;
  size?: number;
}

function AgentAvatar(props: Props) {
  return <Avatar name={props.name.trim() || "O"} size={props.size} />;
}

export default AgentAvatar;
