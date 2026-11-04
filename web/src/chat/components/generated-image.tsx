import { useEffect, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import type { GeneratedImageArtifact } from "@veykor/shared";
import { fetchGeneratedImage } from "../chat-client.ts";

interface Props {
  artifact: GeneratedImageArtifact | null;
  artifactId: string;
  generating: boolean;
  prompt: string;
  error: string;
}

function caption(prompt: string): string {
  return prompt.length > 200 ? `${prompt.slice(0, 200)}…` : prompt;
}

function GeneratedImage(props: Props) {
  const [fetched, setFetched] = useState<GeneratedImageArtifact | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  const needsFetch = props.artifact === null && props.artifactId !== "";

  useEffect(() => {
    if (!needsFetch) {
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const artifact = await fetchGeneratedImage(props.artifactId);

        if (!alive) {
          return;
        }

        setFetched(artifact);
        setFetchFailed(false);

        if (artifact.status === "generating") {
          timer = setTimeout(() => {
            void load();
          }, 2000);
        }
      } catch {
        if (alive) {
          setFetchFailed(true);
        }
      }
    }

    void load();

    return () => {
      alive = false;

      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [needsFetch, props.artifactId]);

  const resolved = props.artifact ?? fetched;
  const prompt =
    resolved !== null && resolved.prompt !== ""
      ? resolved.prompt
      : props.prompt;

  if (resolved !== null && resolved.status === "completed") {
    const alt =
      resolved.prompt === ""
        ? "Generated image"
        : `Generated image: ${caption(resolved.prompt)}`;

    return (
      <figure className="w-full min-w-0 space-y-2">
        <img
          src={resolved.url}
          alt={alt}
          loading="lazy"
          className="max-h-[480px] w-full rounded-xl border border-zinc-800/80 bg-zinc-950 object-contain"
        />

        <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {resolved.prompt !== "" && (
            <span className="min-w-0 flex-1 truncate text-xs font-light text-zinc-500">
              {caption(resolved.prompt)}
            </span>
          )}

          <span className="flex shrink-0 items-center gap-3">
            <a
              href={resolved.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-light text-zinc-400 hover:text-zinc-100"
            >
              <ArrowTopRightOnSquareIcon
                aria-hidden="true"
                className="size-3.5"
              />
              Open
            </a>

            <a
              href={resolved.downloadUrl}
              download
              className="inline-flex items-center gap-1 text-xs font-light text-zinc-400 hover:text-zinc-100"
            >
              <ArrowDownTrayIcon aria-hidden="true" className="size-3.5" />
              Download
            </a>
          </span>
        </figcaption>
      </figure>
    );
  }

  if (resolved !== null && resolved.status === "failed") {
    return (
      <div className="flex w-full items-start gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
        <ExclamationTriangleIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-amber-400"
        />

        <p className="min-w-0 flex-1 text-[13px] font-light text-zinc-300">
          {resolved.error === "" ? "Image generation failed." : resolved.error}
        </p>
      </div>
    );
  }

  if (resolved === null && !needsFetch && !props.generating) {
    return (
      <div className="flex w-full items-start gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
        <ExclamationTriangleIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-amber-400"
        />

        <p className="min-w-0 flex-1 text-[13px] font-light text-zinc-300">
          {props.error === "" ? "Image generation failed." : props.error}
        </p>
      </div>
    );
  }

  if (fetchFailed) {
    return (
      <div className="flex w-full items-start gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
        <ExclamationTriangleIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-amber-400"
        />

        <p className="min-w-0 flex-1 text-[13px] font-light text-zinc-300">
          Unable to load this image.
        </p>
      </div>
    );
  }

  return (
    <div
      aria-label="Generating image"
      className="flex w-full items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-3"
    >
      <PhotoIcon
        aria-hidden="true"
        className="size-5 shrink-0 animate-pulse text-zinc-500 motion-reduce:animate-none"
      />

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-light text-zinc-300">
          Generating image…
        </p>

        {prompt !== "" && (
          <p className="truncate text-xs font-light text-zinc-500">
            {caption(prompt)}
          </p>
        )}
      </div>
    </div>
  );
}

export default GeneratedImage;
