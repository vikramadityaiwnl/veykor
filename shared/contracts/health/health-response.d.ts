export interface HealthResponse {
  status: "ok" | "degraded";
  db: "connected" | "disconnected";
}
