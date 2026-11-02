import type { TranscriptionCatalogResponse } from "@veykor/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { transcribeModel } from "../transcribe/protocol.js";

export function getTranscriptionCatalog(
  userId: number,
): TranscriptionCatalogResponse {
  const user = db
    .select({ transcriptionApiKey: users.transcriptionApiKey })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  const available = (user?.transcriptionApiKey || "") !== "";

  return {
    providers: [
      {
        id: "muse",
        name: "Muse Code",
        available,
        error: available ? "" : "Add a Model API key to enable transcription.",
        source: "Meta Model API live transcription",
        models: available
          ? [
              {
                id: transcribeModel,
                name: "Muse Voice Transcribe",
                description:
                  "Meta's speech-to-text model with live partial transcripts.",
              },
            ]
          : [],
      },
    ],
  };
}
