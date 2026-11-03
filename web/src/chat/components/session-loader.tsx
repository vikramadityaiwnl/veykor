import { useState } from "react";
import Logo from "../../components/logo/logo.tsx";
import { randomLoaderName } from "../loader-names.ts";

function SessionLoader() {
  const [name] = useState(() => randomLoaderName());

  return (
    <div className="space-y-4 text-center" role="status">
      <div className="flex justify-center">
        <span className="animate-pulse motion-reduce:animate-none">
          <Logo size={64} />
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-zinc-100">
          Loading your conversation
        </p>

        <p className="text-xs font-light text-zinc-500">{name}</p>
      </div>
    </div>
  );
}

export default SessionLoader;
