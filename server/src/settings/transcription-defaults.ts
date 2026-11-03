import type { ProviderCliId, TranscriptionDefaults } from "@veykor/shared";

const providerIds: ProviderCliId[] = ["muse", "opencode"];

const modelPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:@+/-]{0,199}$/;

export function emptyTranscriptionDefaults(): TranscriptionDefaults {
  return {
    providerId: "",
    modelId: "",
  };
}

export function parseTranscriptionDefaults(
  value: unknown,
): TranscriptionDefaults {
  let parsed: unknown = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return emptyTranscriptionDefaults();
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyTranscriptionDefaults();
  }

  const candidate = parsed as Partial<TranscriptionDefaults>;

  return {
    providerId: providerIds.includes(candidate.providerId as ProviderCliId)
      ? (candidate.providerId as string)
      : "",
    modelId:
      typeof candidate.modelId === "string" &&
      candidate.modelId !== "" &&
      modelPattern.test(candidate.modelId)
        ? candidate.modelId
        : "",
  };
}

export function validTranscriptionDefaults(
  value: unknown,
): value is TranscriptionDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const input = value as TranscriptionDefaults;

  if (
    typeof input.providerId !== "string" ||
    (input.providerId !== "" &&
      !providerIds.includes(input.providerId as ProviderCliId))
  ) {
    return false;
  }

  return (
    typeof input.modelId === "string" &&
    (input.modelId === "" || modelPattern.test(input.modelId))
  );
}
