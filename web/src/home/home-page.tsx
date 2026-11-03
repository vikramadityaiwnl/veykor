import type { AuthUser } from "@veykor/shared";
import WorkspaceLayout from "../workspace/workspace-layout.tsx";

interface Props {
  onSignedOut: () => void;
  user: AuthUser;
}

function HomePage(props: Props) {
  return <WorkspaceLayout onSignedOut={props.onSignedOut} user={props.user} />;
}

export default HomePage;
