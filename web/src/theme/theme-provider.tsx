import { useEffect } from "react";
import type { ReactNode } from "react";
import { applyThemeVariables } from "./theme-colors.ts";
import { useThemeStore } from "./theme-store.ts";

interface Props {
  children: ReactNode;
}

function ThemeProvider(props: Props) {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    applyThemeVariables(theme);
  }, [theme]);

  return <>{props.children}</>;
}

export default ThemeProvider;
