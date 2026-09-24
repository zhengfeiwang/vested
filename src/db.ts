const DB_NAME = "vested";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("entries")) {
        db.createObjectStore("entries", { keyPath: "id" }).createIndex(
          "date",
          "date",
        );
      }
      if (!db.objectStoreNames.contains("formulas")) {
        db.createObjectStore("formulas", { keyPath: "version" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store: string, value: unknown): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
}

export async function bulkPut(store: string, values: unknown[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await txDone(tx);
}

export async function del(store: string, key: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function clear(store: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  await txDone(tx);
}
