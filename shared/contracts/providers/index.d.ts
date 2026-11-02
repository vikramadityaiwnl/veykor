export type ProviderCliId = "muse" | "opencode";

export interface ProviderCliStatus {
  id: ProviderCliId;
  cli: string;
  label: string;
  company: string;
  installed: boolean;
  version: string;
}

export interface CliStatusResponse {
  providers: ProviderCliStatus[];
}
