import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "./auth/auth-store";
import { Theme } from "@astryxdesign/core/theme";
import { veykorTheme } from "./veykor-theme";
import { useThemeStore } from "./theme-store";

interface Props {
  children: ReactNode;
}

export function AppTheme(props: Props) {
  const userId = useAuthStore((state) => state.status?.user?.id);
  const load = useThemeStore((state) => state.load);

  useEffect(() => {
    if (userId) {
      void load().catch(() => {});
    }
  }, [userId, load]);

  const mode = useThemeStore((state) => state.mode);

  return (
    <Theme theme={veykorTheme} mode={mode}>
      {props.children}
    </Theme>
  );
}
