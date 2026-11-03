import {
  ChatBubbleLeftRightIcon,
  CpuChipIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import Logo from "../logo/logo.tsx";

interface ProofPoint {
  description: string;
  icon: ReactNode;
  title: string;
}

interface Props {
  description: string;
  title: string;
}

const proofPoints: Array<ProofPoint> = [
  {
    description: "Your data never leaves your local network.",
    icon: (
      <ShieldCheckIcon aria-hidden="true" className="size-5 text-zinc-100" />
    ),
    title: "Private by default",
  },
  {
    description: "Every conversation remembers your workspace.",
    icon: (
      <ChatBubbleLeftRightIcon
        aria-hidden="true"
        className="size-5 text-zinc-100"
      />
    ),
    title: "Chats with memory",
  },
  {
    description: "Put routine work on autopilot with agents.",
    icon: <CpuChipIcon aria-hidden="true" className="size-5 text-zinc-100" />,
    title: "Agentic workflows",
  },
];

function BrandPanel(props: Props) {
  return (
    <section className="hidden border-r border-zinc-800 bg-zinc-900/40 md:flex md:items-center md:justify-center md:px-12">
      <div className="w-full max-w-md space-y-10">
        <div className="flex items-center gap-3">
          <Logo size={36} />

          <span className="text-xl font-semibold text-zinc-50">veykor</span>
        </div>

        <div className="space-y-3">
          <h2 className="text-3xl font-semibold text-zinc-50">{props.title}</h2>

          <p className="text-base font-light text-zinc-400">
            {props.description}
          </p>
        </div>

        <ul className="space-y-6">
          {proofPoints.map((point) => (
            <li key={point.title} className="flex gap-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-zinc-800 bg-zinc-900">
                {point.icon}
              </div>

              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-100">
                  {point.title}
                </p>

                <p className="text-sm font-light text-zinc-400">
                  {point.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default BrandPanel;
