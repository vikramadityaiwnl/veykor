import { useState } from "react";
import Logo from "../../components/logo/logo.tsx";
import { randomGreeting } from "../greeting-titles.ts";

function GreetingHeader() {
  const [title] = useState(() => randomGreeting());

  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center opacity-40">
        <Logo size={96} />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-zinc-100">{title}</h2>

        <p className="text-sm font-light text-zinc-400">
          Ask anything or think something through with veykor.
        </p>
      </div>
    </div>
  );
}

export default GreetingHeader;
