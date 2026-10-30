import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  HealthResponse,
  VisitsResponse,
} from "@veykor/shared";

async function requestJson<Response>(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as Response;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [visitCount, setVisitCount] = useState<number | null>(null);
  const [visitsError, setVisitsError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    requestJson<HealthResponse>("/api/health")
      .then((response) => {
        if (isActive) setHealth(response);
      })
      .catch((error: unknown) => {
        if (isActive) setHealthError(getErrorMessage(error));
      });

    requestJson<VisitsResponse>("/api/visits")
      .then((response) => {
        if (isActive) setVisitCount(response.count);
      })
      .catch((error: unknown) => {
        if (isActive) setVisitsError(getErrorMessage(error));
      });

    return () => {
      isActive = false;
    };
  }, []);

  const incrementVisits = async () => {
    setVisitsError(null);

    try {
      const response = await requestJson<VisitsResponse>("/api/visits", {
        method: "POST",
      });
      setVisitCount(response.count);
    } catch (error) {
      setVisitsError(getErrorMessage(error));
    }
  };

  return (
    <VStack
      gap={4}
      hAlign="center"
      justify="center"
      minHeight="100svh"
      padding={4}
    >
      <Heading level={1} weight="semibold">
        veykor
      </Heading>
      <Text>Neutral theme preview</Text>
      <Button label="Astryx button is working" variant="primary" size="lg" />

      <Card elevation="low">
        <VStack gap={3}>
          <VStack gap={1}>
            <Heading level={2} weight="semibold">
              Server API
            </Heading>
            <Text type="supporting">
              Live health and visitor count from the backend.
            </Text>
          </VStack>

          <VStack gap={1}>
            <Text>
              Backend:{" "}
              {health?.status ?? (healthError ? "unavailable" : "checking…")}
            </Text>
            <Text>
              Database:{" "}
              {health?.db ?? (healthError ? "unavailable" : "checking…")}
            </Text>
            <Text>
              Visitor count:{" "}
              {visitCount?.toLocaleString() ??
                (visitsError ? "unavailable" : "loading…")}
            </Text>
          </VStack>

          {(healthError || visitsError) && (
            <Text type="supporting">{healthError ?? visitsError}</Text>
          )}

          <Button
            label="Increment visitor count"
            variant="secondary"
            clickAction={incrementVisits}
          />
          <Text type="supporting">
            GET /api/health · GET /api/visits · POST /api/visits
          </Text>
        </VStack>
      </Card>
    </VStack>
  );
}

export default App;
