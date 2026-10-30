import { useRef, useState, type ChangeEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPeopleGroup,
  faListCheck,
  faServer,
  faPen,
} from "@fortawesome/free-solid-svg-icons";
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
import logo from "../../../assets/logo-rounded.png";

const layoutStyles = `
  .auth-page {
    --veykor-icon-size: var(--spacing-4);
    --veykor-icon-size-small: var(--spacing-3);

    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    background: var(--color-background-body);
  }

  .auth-story,
  .auth-entry {
    min-width: 0;
    padding: clamp(var(--spacing-6), 6vw, calc(var(--spacing-12) * 2));
  }

  .auth-story {
    background: var(--color-background-surface);
    border-inline-end: var(--border-width) solid var(--color-border);
  }

  .auth-story-content {
    width: 100%;
    max-width: 30rem;
  }

  .auth-proof-icon {
    width: var(--veykor-icon-size);
    height: var(--veykor-icon-size);
    flex-shrink: 0;
    color: var(--color-icon-secondary);
  }

  .auth-avatar-edit {
    width: var(--veykor-icon-size);
    height: var(--veykor-icon-size);
    color: var(--color-icon-primary);
    pointer-events: none;
  }

  .auth-story-heading {
    max-width: 18ch;
    font-size: var(--text-display-3-size);
    line-height: var(--text-display-3-leading);
    letter-spacing: -0.025em;
  }

  .auth-brand {
    width: var(--spacing-10);
    height: var(--spacing-10);
    object-fit: contain;
    border-radius: var(--radius-element);
  }

  .auth-form input {
    font-size: max(1rem, var(--text-body-size));
  }

  .auth-form-control {
    min-height: var(--spacing-12);
  }

  .auth-submit {
    min-height: var(--spacing-12);
  }

  @media (max-width: 48rem) {
    .auth-page {
      grid-template-columns: minmax(0, 1fr);
    }

    .auth-story {
      border-inline-end: none;
      border-block-end: var(--border-width) solid var(--color-border);
      padding-block: var(--spacing-8);
    }

    .auth-story-heading {
      max-width: 18ch;
      font-size: var(--text-heading-1-size);
      line-height: var(--text-heading-1-leading);
      letter-spacing: -0.025em;
    }

    .auth-story-content {
      gap: var(--spacing-4);
    }

    .auth-entry {
      padding-block: var(--spacing-10);
    }
  }
`;

export function AuthPage() {
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
    return <Navigate to="/organizations" replace />;
  }

  return (
    <>
      <style>{layoutStyles}</style>

      <Grid role="main" columns={2} minHeight="100svh" className="auth-page">
        <VStack as="section" className="auth-story" justify="center">
          <VStack className="auth-story-content" gap={8}>
            <HStack gap={3} vAlign="center">
              <img className="auth-brand" src={logo} alt="" />
              <Text size="xl" weight="semibold">
                veykor
              </Text>
            </HStack>

            <VStack gap={6}>
              <Heading
                level={1}
                weight="semibold"
                className="auth-story-heading"
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

            <VStack as="ul" gap={4} style={{ listStyle: "none" }}>
              <HStack as="li" gap={3} vAlign="start">
                <FontAwesomeIcon
                  icon={faPeopleGroup}
                  className="auth-proof-icon"
                  aria-hidden="true"
                />
                <Text>Collaborate with specialized agents</Text>
              </HStack>

              <HStack as="li" gap={3} vAlign="start">
                <FontAwesomeIcon
                  icon={faListCheck}
                  className="auth-proof-icon"
                  aria-hidden="true"
                />
                <Text>Delegate tasks and review the results</Text>
              </HStack>

              <HStack as="li" gap={3} vAlign="start">
                <FontAwesomeIcon
                  icon={faServer}
                  className="auth-proof-icon"
                  aria-hidden="true"
                />
                <Text>Work on your own infrastructure</Text>
              </HStack>
            </VStack>
          </VStack>
        </VStack>

        <VStack
          as="section"
          className="auth-entry"
          justify="center"
          hAlign="center"
        >
          <VStack width="100%" maxWidth="25rem" gap={8}>
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
              className="auth-form"
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
                            className="auth-avatar-edit"
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
                    controlClassName="auth-form-control"
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
                    controlClassName="auth-form-control"
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
                  className="auth-submit"
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
