import { useRef, useState } from "react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useAuthStore } from "../../auth/auth-store";

export function SettingsProfilePanel() {
  const user = useAuthStore((state) => state.status?.user);
  const update = useAuthStore((state) => state.updateProfile);
  const [username, setUsername] = useState(user?.username || "");
  const [photo, setPhoto] = useState(user?.photo || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function save() {
    if (busy || reading) {
      return;
    }

    setBusy(true);
    setError("");
    setSaved(false);

    try {
      await update({ username, photo, password });
      setPassword("");
      setSaved(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to update profile",
      );
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setError("");
    setSaved(false);

    if (
      file.size > 250_000 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      setError("Choose a PNG, JPEG, or WebP photo under 250 KB.");
      return;
    }

    setReading(true);

    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Unable to read photo"));
        reader.readAsDataURL(file);
      });
      setPhoto(data);
    } catch {
      setError("Unable to read this photo. Please try another.");
    } finally {
      setReading(false);
    }
  }

  return (
    <VStack
      id="settings-panel-profile"
      gap={6}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="w-full max-w-2xl"
      >
        <VStack gap={4}>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Profile photo"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void upload(file);
              }
              event.target.value = "";
            }}
          />

          <VStack gap={6}>
            <HStack gap={4} vAlign="center" wrap="wrap">
              <Avatar
                name={username || "Your profile"}
                src={photo || undefined}
                size={72}
              />
            </HStack>
            <TextInput
              label="Username"
              value={username}
              onChange={setUsername}
              isDisabled={busy}
              autoComplete="username"
            />
            <TextInput
              label="New password"
              type="password"
              value={password}
              onChange={setPassword}
              isDisabled={busy}
              autoComplete="new-password"
            />
          </VStack>
          {error && (
            <Banner
              status="error"
              title="Couldn't save profile"
              description={error}
            />
          )}
          {saved && <Banner status="success" title="Profile updated" />}
          <HStack gap={2} vAlign="center" wrap="wrap">
            {photo && (
              <Button
                label="Remove photo"
                variant="ghost"
                isDisabled={busy || reading}
                clickAction={() => setPhoto("")}
              />
            )}
            <Button
              label="Upload photo"
              variant="secondary"
              isDisabled={busy || reading}
              clickAction={() => input.current?.click()}
            />
            <Button
              label={busy ? "Saving…" : "Save changes"}
              type="submit"
              isDisabled={busy || reading}
            />
          </HStack>
        </VStack>
      </form>
    </VStack>
  );
}
