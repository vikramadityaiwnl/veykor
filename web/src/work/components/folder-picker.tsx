import { useEffect, useState } from "react";
import { FolderIcon } from "@heroicons/react/24/outline";
import { workRequest } from "../work-client.ts";

interface Props {
  initialPath: string;
  onSelect: (path: string, name: string) => void;
  onCancel: () => void;
}

interface FolderListing {
  path: string;
  name: string;
  parent: string;
  folders: { name: string; path: string }[];
}

function FolderPicker(props: Props) {
  const [listing, setListing] = useState<FolderListing>({
    path: "",
    name: "",
    parent: "",
    folders: [],
  });
  const [path, setPath] = useState(props.initialPath);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function open(folder: string) {
    setLoading(true);
    setError("");

    try {
      const next = await workRequest<FolderListing>(
        `projects/folders?path=${encodeURIComponent(folder)}`,
      );
      setListing(next);
      setPath(next.path);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to open folder.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let disposed = false;

    void workRequest<FolderListing>(
      `projects/folders?path=${encodeURIComponent(props.initialPath)}`,
    )
      .then((next) => {
        if (!disposed) {
          setListing(next);
          setPath(next.path);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setError(
            cause instanceof Error ? cause.message : "Unable to open folder.",
          );
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [props.initialPath]);

  return (
    <div className="space-y-3 rounded-xl border border-zinc-700 p-3">
      <p className="text-sm font-semibold">Choose a folder on this computer</p>
      <div className="flex gap-2">
        <input
          aria-label="Folder path"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void open(path);
            }
          }}
        />
        <button
          type="button"
          className="text-xs"
          onClick={() => void open(path)}
        >
          Open
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      )}
      <div className="h-48 overflow-y-auto">
        {loading ? (
          <p className="p-2 text-xs text-zinc-500">Loading folders…</p>
        ) : (
          <>
            <button
              type="button"
              className="block w-full rounded-lg px-2 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-800"
              onClick={() => void open(listing.parent)}
            >
              ↑ Parent folder
            </button>
            {listing.folders.map((folder) => (
              <button
                type="button"
                key={folder.path}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                onClick={() => void open(folder.path)}
              >
                <FolderIcon className="size-4" />
                {folder.name}
              </button>
            ))}
            {listing.folders.length === 0 && (
              <p className="p-2 text-xs text-zinc-500">No subfolders</p>
            )}
          </>
        )}
      </div>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          className="text-xs text-zinc-400"
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={loading || !listing.path || !!error}
          className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-40"
          onClick={() => props.onSelect(listing.path, listing.name)}
        >
          Use this folder
        </button>
      </div>
    </div>
  );
}

export default FolderPicker;
