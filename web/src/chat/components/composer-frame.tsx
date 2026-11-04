import type { ReactNode } from "react";
import type { ComposerMode } from "../composer-mode.ts";
import ProjectComposerContext from "../../work/components/project-composer-context.tsx";

interface Props {
  mode: ComposerMode;
  panelOpen: boolean;
  children: ReactNode;
}

function ComposerFrame(props: Props) {
  const project = props.mode === "project";
  const shape = project ? "rounded-t-3xl" : "rounded-3xl";
  const connected = props.panelOpen ? "rounded-t-none border-t-0" : "";

  return (
    <>
      <div
        className={`${shape} ${connected} border border-zinc-700 bg-zinc-900 shadow-xl`}
        data-composer-mode={props.mode}
      >
        {props.children}
      </div>
      {project && <ProjectComposerContext />}
    </>
  );
}

export default ComposerFrame;
