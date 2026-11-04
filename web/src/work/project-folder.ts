import type { WorkProject } from "@veykor/shared";

export function isFolderMissing(
  projectId: string,
  loaded: boolean,
  project: WorkProject | undefined,
): boolean {
  return (
    projectId !== "" &&
    loaded &&
    project !== undefined &&
    project.folderExists === false
  );
}
