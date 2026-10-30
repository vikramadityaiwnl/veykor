import { type ReactNode } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { veykorTheme } from "./veykor-theme";
import { useThemeStore } from "./theme-store";

interface Props {
  children: ReactNode;
}

export function AppTheme(props: Props) {
  const mode = useThemeStore((state) => state.mode);

  return (
    <Theme theme={veykorTheme} mode={mode}>
      {props.children}
    </Theme>
  );
}
