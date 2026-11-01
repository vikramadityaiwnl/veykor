import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const stagingRoot = join(tmpdir(), "veykor-uploads");

function stagedPath(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    throw new Error("Invalid attachment id");
  }

  return join(stagingRoot, id);
}

export async function stageAttachment(
  id: string,
  bytes: Uint8Array,
): Promise<void> {
  await mkdir(stagingRoot, { recursive: true });
  await writeFile(stagedPath(id), bytes, { mode: 0o600 });
}

async function readable(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function attachmentBytes(id: string): Promise<Buffer | undefined> {
  try {
    return await readFile(stagedPath(id));
  } catch {
    return undefined;
  }
}

export async function attachmentAvailable(id: string): Promise<boolean> {
  try {
    return await readable(stagedPath(id));
  } catch {
    return false;
  }
}

export async function removeStaged(id: string): Promise<void> {
  await rm(stagedPath(id), { force: true });
}

export async function sweepStaging(keep: Set<string>): Promise<void> {
  let entries: string[];

  try {
    entries = await readdir(stagingRoot);
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => !keep.has(entry))
      .map((entry) => rm(join(stagingRoot, entry), { force: true })),
  );
}
