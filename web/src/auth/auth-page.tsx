import { useRef, useState, type ChangeEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPeopleGroup, faListCheck, faServer, faPen, faSun, faMoon } from "@fortawesome/free-solid-svg-icons";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Link } from "@astryxdesign/core/Link";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { SessionLoading } from "./auth-routes";
import { useAuthStore } from "./auth-store";
import logoDark from "../../../assets/logo-dark.png";
import logoLight from "../../../assets/logo-light.png";
import { useThemeStore } from "../theme-store";

export function AuthPage() {
  const mode = useThemeStore((state) => state.mode);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const status = useAuthStore((state) => state.status);
  const submitCredentials = useAuthStore((state) => state.submit);

  const [searchParams, setSearchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const photoInput = useRef<HTMLInputElement>(null);
  const photoVersion = useRef(0);
  const creating =
    searchParams.get("mode") === "setup" &&
    status?.registrationAllowed === true;

  async function submit() {
    if (busy) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await submitCredentials(creating ? "register" : "login", {
        username,
        password,
        ...(creating && photo ? { photo } : {}),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const version = ++photoVersion.current;

    if (!file) {
      return;
    }

    if (file.size > 250_000) {
      setError("This image is too large. Please choose one under 250 KB.");
      event.target.value = "";

      return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError(
        "This image format isn't supported. Choose a PNG, JPEG, or WebP image.",
      );
      event.target.value = "";

      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (version === photoVersion.current) {
        setPhoto(String(reader.result));
        setError("");
      }
    };

    reader.onerror = () => {
      setError("This photo could not be read. Please choose another.");
    };

    reader.readAsDataURL(file);
  }

  function removePhoto() {
    ++photoVersion.current;
    setPhoto(undefined);

    if (photoInput.current) {
      photoInput.current.value = "";
    }
  }

  function toggleSetup() {
    setSearchParams(creating ? {} : { mode: "setup" });
    setError("");
    setPassword("");
    removePhoto();
  }

  if (!status) {
    return <SessionLoading />;
  }

  if (status.user) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Grid
        role="main"
        columns={2}
        minHeight="100svh"
        className="relative grid-cols-1! grid-rows-[auto_1fr] bg-(--color-background-body) md:grid-cols-2! md:grid-rows-1"
      >
        <HStack className="absolute top-4 right-4 z-10">
          <Button
            label={
              mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
            }
            tooltip={
              mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
            }
            isIconOnly
            icon={<FontAwesomeIcon icon={mode === "dark" ? faSun : faMoon} />}
            clickAction={toggleTheme}
          />
        </HStack>
        <VStack
          as="section"
          className="min-w-0 px-6 pt-8 md:border-r md:border-solid md:border-(--color-border) md:bg-(--color-background-surface) md:p-[clamp(var(--spacing-6),6vw,calc(var(--spacing-12)*2))]"
          justify="center"
        >
          <VStack
            className="w-full max-w-120 gap-(--spacing-4)! md:gap-(--spacing-8)!"
            gap={8}
          >
            <HStack gap={3} vAlign="center">
              <img
                className="size-(--spacing-10) rounded-(--radius-element) object-contain"
                src={mode === "dark" ? logoDark : logoLight}
                alt=""
              />
              <Text size="xl" weight="semibold">
                veykor
              </Text>
            </HStack>

            <VStack gap={6} className="hidden! md:flex!">
              <Heading
                level={1}
                weight="semibold"
                className="max-w-[18ch] text-(length:--text-heading-1-size)! leading-(--text-heading-1-leading)! tracking-tight md:text-(length:--text-display-3-size)! md:leading-(--text-display-3-leading)!"
              >
                Build together.
                <br />
                Stay in control.
              </Heading>

              <Text color="secondary" textWrap="pretty">
                veykor is a self-hosted development environment where you work
                alongside a team of AI agents to plan, build, and review
                software, while staying in control of the work.
              </Text>
            </VStack>

            <VStack as="ul" gap={4} className="hidden! list-none md:flex!">
              <HStack as="li" gap={3} vAlign="start">
                <FontAwesomeIcon
                  icon={faPeopleGroup}
                  className="size-(--spacing-4) shrink-0 text-(--color-icon-secondary)"
                  aria-hidden="true"
                />
                <Text>Collaborate with specialized agents</Text>
              </HStack>

              <HStack as="li" gap={3} vAlign="start">
                <FontAwesomeIcon
                  icon={faListCheck}
                  className="size-(--spacing-4) shrink-0 text-(--color-icon-secondary)"
                  aria-hidden="true"
                />
                <Text>Delegate tasks and review the results</Text>
              </HStack>

              <HStack as="li" gap={3} vAlign="start">
                <FontAwesomeIcon
                  icon={faServer}
                  className="size-(--spacing-4) shrink-0 text-(--color-icon-secondary)"
                  aria-hidden="true"
                />
                <Text>Work on your own infrastructure</Text>
              </HStack>
            </VStack>
          </VStack>
        </VStack>

        <VStack
          as="section"
          className="min-w-0 justify-start! px-6 py-12 md:justify-center! md:p-[clamp(var(--spacing-6),6vw,calc(var(--spacing-12)*2))]"
          justify="center"
          hAlign="center"
        >
          <VStack className="w-full max-w-100" gap={8}>
            <VStack gap={3}>
              <Heading level={2} weight="semibold">
                {creating ? "Start with you." : "Welcome back."}
              </Heading>
              <Text color="secondary">
                {creating
                  ? "Create your account to get started."
                  : "Sign in and pick up where you left off."}
              </Text>
            </VStack>

            <form
              className="[&_input]:text-base"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <VStack gap={6}>
                {creating && (
                  <VStack gap={3} hAlign="center">
                    <VStack gap={3} hAlign="center">
                      <Avatar
                        name={username || "User"}
                        alt="Edit profile photo"
                        src={photo}
                        size={96}
                        tooltip="Edit profile photo"
                        aria-disabled={busy}
                        onClick={() => {
                          if (!busy) {
                            photoInput.current?.click();
                          }
                        }}
                        status={
                          <FontAwesomeIcon
                            icon={faPen}
                            className="pointer-events-none size-(--spacing-4) text-(--color-icon-primary)"
                            aria-hidden="true"
                          />
                        }
                      />

                      {photo && (
                        <Button
                          label="Remove photo"
                          variant="ghost"
                          isDisabled={busy}
                          clickAction={removePhoto}
                        />
                      )}
                    </VStack>
                    <input
                      ref={photoInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-label="Profile photo"
                      onChange={pickPhoto}
                      disabled={busy}
                      hidden
                    />
                  </VStack>
                )}

                <VStack gap={5}>
                  <TextInput
                    label="Username"
                    htmlName="username"
                    value={username}
                    onChange={setUsername}
                    autoComplete="username"
                    placeholder="username"
                    isLabelHidden
                    size="lg"
                    width="100%"
                    controlClassName="min-h-(--spacing-12)"
                    isRequired
                    isDisabled={busy}
                  />
                  <TextInput
                    label="Password"
                    htmlName="password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    autoComplete={
                      creating ? "new-password" : "current-password"
                    }
                    placeholder="password"
                    isLabelHidden
                    description={
                      creating ? "Use at least 8 characters." : undefined
                    }
                    size="lg"
                    width="100%"
                    controlClassName="min-h-(--spacing-12)"
                    isRequired
                    isDisabled={busy}
                  />
                </VStack>

                {error && (
                  <Banner
                    status="error"
                    title={
                      creating
                        ? "Couldn't create your account"
                        : "Couldn't sign you in"
                    }
                    description={error}
                    role="alert"
                  />
                )}

                <Button
                  className="min-h-(--spacing-12)"
                  label={creating ? "Create account" : "Sign in"}
                  type="submit"
                  variant="primary"
                  size="lg"
                  width="100%"
                  isLoading={busy}
                  isDisabled={busy}
                />
              </VStack>
            </form>

            {status.registrationAllowed ? (
              <VStack gap={5}>
                <Divider label="or" />

                <HStack hAlign="center">
                  <Link
                    href={creating ? "?" : "?mode=setup"}
                    color="primary"
                    isStandalone
                    isDisabled={busy}
                    onClick={(event) => {
                      event.preventDefault();
                      toggleSetup();
                    }}
                  >
                    {creating ? "Back to sign in" : "Create account"}
                  </Link>
                </HStack>
              </VStack>
            ) : (
              <Text type="supporting" color="secondary">
                A workspace for you and the things you're building.
              </Text>
            )}
          </VStack>
        </VStack>
      </Grid>
    </>
  );
}
