import { useEffect } from "react";
import { useAuthStore } from "./auth-store";

export function useAuthSession() {
  const expiresAt = useAuthStore((state) => state.status?.expiresAt);
  const refresh = useAuthStore((state) => state.refresh);
  const expire = useAuthStore((state) => state.expire);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);

    function checkSession() {
      void refresh();
    }

    window.addEventListener("focus", checkSession);

    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("focus", checkSession);
    };
  }, [refresh]);

  useEffect(() => {
    if (!expiresAt) {
      return;
    }

    const timer = window.setTimeout(
      () => {
        expire();
        void refresh();
      },
      Math.max(0, expiresAt * 1000 - Date.now()),
    );

    const interval = window.setInterval(() => {
      void refresh();
    }, 60_000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [expiresAt, expire, refresh]);
}
