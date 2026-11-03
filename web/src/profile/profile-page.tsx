import { useEffect, useState } from "react";
import Avatar from "../components/avatar/avatar.tsx";
import Divider from "../components/divider/divider.tsx";
import { useProfileStore } from "./profile-store.ts";

interface Draft {
  username: string;
  status: string;
}

function ProfilePage() {
  const username = useProfileStore((state) => state.username);
  const tag = useProfileStore((state) => state.tag);
  const status = useProfileStore((state) => state.status);
  const loaded = useProfileStore((state) => state.loaded);
  const saving = useProfileStore((state) => state.saving);
  const error = useProfileStore((state) => state.error);
  const load = useProfileStore((state) => state.load);
  const saveProfile = useProfileStore((state) => state.saveProfile);
  const clearErrors = useProfileStore((state) => state.clearErrors);

  const [draft, setDraft] = useState<Draft>({ username: "", status: "" });
  const [hydrated, setHydrated] = useState(false);

  const dirty =
    hydrated && (draft.username !== username || draft.status !== status);

  function setField(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleSave() {
    await saveProfile({
      username: draft.username,
      tag,
      status: draft.status,
    });
  }

  function handleDiscard() {
    setDraft({ username, status });
    clearErrors();
  }

  useEffect(() => {
    void load();
  }, [load]);

  if (loaded && !hydrated) {
    setDraft({ username, status });
    setHydrated(true);
  }

  if (!hydrated) {
    return (
      <div className="grid flex-1 place-items-center px-6">
        <p className="text-sm font-light text-zinc-400" role="status">
          Loading profile...
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-50">Profile</h1>

          <p className="text-sm font-light text-zinc-400">
            Manage how you appear across veykor.
          </p>
        </div>

        <Divider />

        <div className="grid grid-cols-2 items-start gap-10 2xl:grid-cols-3">
          <div className="grid min-w-0 place-items-center self-stretch">
            <div className="flex items-center gap-4">
              <Avatar name={draft.username} size={80} />

              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-zinc-50">
                  {draft.username}
                </p>

                <p className="truncate text-sm font-light text-zinc-500">
                  {draft.status === "" ? tag : draft.status}
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <div className="space-y-1.5">
              <label
                className="block text-sm font-light text-zinc-300"
                htmlFor="profile-username"
              >
                Username
              </label>

              <input
                autoComplete="username"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
                id="profile-username"
                name="username"
                onChange={(event) => setField("username", event.target.value)}
                type="text"
                value={draft.username}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="block text-sm font-light text-zinc-300"
                htmlFor="profile-status"
              >
                Status
              </label>

              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
                id="profile-status"
                name="status"
                onChange={(event) => setField("status", event.target.value)}
                placeholder="What are you working on?"
                type="text"
                value={draft.status}
              />
            </div>

            {error !== "" && (
              <p className="text-sm font-light text-rose-400" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                className="cursor-pointer rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white light:hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving || !dirty}
                onClick={() => void handleSave()}
                type="button"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>

              <button
                className={
                  dirty
                    ? "visible cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 opacity-100 transition-all duration-200 hover:bg-zinc-800"
                    : "invisible -translate-x-2 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 opacity-0 transition-all duration-200"
                }
                onClick={handleDiscard}
                tabIndex={dirty ? 0 : -1}
                type="button"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
