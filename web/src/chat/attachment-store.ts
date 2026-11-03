export interface StoredAttachment {
  blob: Blob;
  id: string;
  mediaType: string;
  name: string;
}

const databaseName = "veykor";
const databaseVersion = 1;
const attachmentStore = "attachments";
const chatAttachmentStore = "chat-attachments";

let database: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (database !== null) {
    return Promise.resolve(database);
  }

  if (opening !== null) {
    return opening;
  }

  opening = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(attachmentStore)) {
        db.createObjectStore(attachmentStore, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(chatAttachmentStore)) {
        db.createObjectStore(chatAttachmentStore, { keyPath: "chatId" });
      }
    };

    request.onsuccess = () => {
      database = request.result;
      opening = null;
      resolve(database);
    };

    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });

  return opening;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (storage: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = action(transaction.objectStore(store));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function saveAttachment(
  attachment: StoredAttachment,
): Promise<void> {
  await run(attachmentStore, "readwrite", (storage) => storage.put(attachment));
}

export async function readAttachment(
  id: string,
): Promise<StoredAttachment | null> {
  const record = await run<StoredAttachment | undefined>(
    attachmentStore,
    "readonly",
    (storage) => storage.get(id),
  );

  return record ?? null;
}

export async function readChatAttachmentIds(
  chatId: string,
): Promise<Array<string>> {
  const record = await run<{ chatId: string; ids: Array<string> } | undefined>(
    chatAttachmentStore,
    "readonly",
    (storage) => storage.get(chatId),
  );

  return record?.ids ?? [];
}

export async function appendChatAttachmentIds(
  chatId: string,
  ids: Array<string>,
): Promise<void> {
  const current = await readChatAttachmentIds(chatId);

  await run(chatAttachmentStore, "readwrite", (storage) =>
    storage.put({ chatId, ids: [...current, ...ids] }),
  );
}

export async function deleteChatAttachments(chatId: string): Promise<void> {
  const ids = await readChatAttachmentIds(chatId);

  await run(chatAttachmentStore, "readwrite", (storage) =>
    storage.delete(chatId),
  );

  await Promise.all(
    ids.map((id) =>
      run(attachmentStore, "readwrite", (storage) => storage.delete(id)),
    ),
  );
}

export function blobFromBase64(base64Data: string, mediaType: string): Blob {
  const bytes = Uint8Array.from(atob(base64Data), (character) =>
    character.charCodeAt(0),
  );

  return new Blob([bytes], { type: mediaType });
}
