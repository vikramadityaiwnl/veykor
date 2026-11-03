import type { AuthUser } from "@veykor/shared";
import WorkspaceLayout from "../workspace/workspace-layout.tsx";

interface Props {
  onSignedOut: () => void;
  pathname: string;
  user: AuthUser;
}

function HomePage(props: Props) {
  return (
    <WorkspaceLayout
      onSignedOut={props.onSignedOut}
      pathname={props.pathname}
      user={props.user}
    />
  );
}

export default HomePage;
