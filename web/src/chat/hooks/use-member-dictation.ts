import { useCallback, useEffect, useRef, useState } from "react";
import {
  classifyMicrophoneFailure,
  queryMicrophonePermission,
  startTranscription,
} from "../transcription-client.ts";
import type { ActiveTranscription } from "../transcription-client.ts";

type Phase = "idle" | "connecting" | "listening" | "stopping";

export function useMemberDictation(
  draft: string,
  onText: (text: string) => void,
  visible: boolean,
) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const sessionRef = useRef<ActiveTranscription | null>(null);
  const prefixRef = useRef("");
  const runRef = useRef(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
      runRef.current += 1;
      sessionRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      runRef.current += 1;
      sessionRef.current?.abort();
      sessionRef.current = null;
      const run = runRef.current;

      queueMicrotask(() => {
        if (aliveRef.current && runRef.current === run) {
          setPhase("idle");
        }
      });
    }
  }, [visible]);

  const stop = useCallback(async (): Promise<string | null> => {
    runRef.current += 1;
    const session = sessionRef.current;

    sessionRef.current = null;

    if (!session) {
      setPhase("idle");
      return null;
    }

    setPhase("stopping");

    try {
      const result = await session.stop();
      const text = prefixRef.current + result;

      if (aliveRef.current) {
        onText(text);
      }

      return text;
    } catch (cause) {
      if (aliveRef.current) {
        setError(
          cause instanceof Error ? cause.message : "Voice input failed.",
        );
      }

      return null;
    } finally {
      if (aliveRef.current) {
        setPhase("idle");
      }
    }
  }, [onText]);

  async function toggle() {
    if (phase !== "idle" && visible) {
      await stop();
      return;
    }

    const run = ++runRef.current;

    prefixRef.current = draft && !/\s$/.test(draft) ? `${draft} ` : draft;
    setError("");
    setPhase("connecting");

    try {
      const session = await startTranscription({
        onReady: () => {
          if (runRef.current === run) {
            setPhase("listening");
          }
        },
        onTranscript: (text) => {
          if (runRef.current === run) {
            onText(prefixRef.current + text);
          }
        },
        onClosed: () => {
          if (runRef.current === run && aliveRef.current) {
            sessionRef.current = null;
            setPhase("idle");
          }
        },
        onError: (message) => {
          if (runRef.current === run) {
            setError(message);
          }
        },
      });

      if (runRef.current !== run || !aliveRef.current) {
        session.abort();
        return;
      }

      sessionRef.current = session;
    } catch (cause) {
      if (runRef.current !== run || !aliveRef.current) {
        return;
      }

      if (cause instanceof DOMException) {
        const failure = classifyMicrophoneFailure(
          cause,
          await queryMicrophonePermission(),
        );

        setError(failure.message);
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "Voice input failed to start.",
        );
      }

      setPhase("idle");
    }
  }

  const active = visible && phase !== "idle";

  return { phase: active ? phase : "idle", active, error, toggle, stop };
}
