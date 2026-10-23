"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Compose } from "@/lib/types";

type Snapshot = {
  key: string;
  compose: Compose;
  files: File[];
  updatedAt: string;
};
function meaningful(compose: Compose, files: File[]) {
  return Boolean(
    compose.to.trim() ||
    compose.cc.trim() ||
    compose.bcc.trim() ||
    compose.subject.trim() ||
    compose.text.trim() ||
    compose.html?.trim() ||
    files.length,
  );
}
function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("frankiflow-mail-device-drafts", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("drafts", { keyPath: "key" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      let tx: IDBTransaction, result: IDBRequest<T>;
      try { tx = db.transaction("drafts", mode); result = action(tx.objectStore("drafts")); }
      catch (error) { db.close(); reject(error); return; }
      tx.oncomplete = () => {
        db.close();
        resolve(result.result);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error("Draft storage transaction failed."));
      };
      tx.onerror = () => {
        /* onabort reports the transaction failure. */
      };
    };
  });
}

/** One recoverable in-progress compose per signed-in account, separate from the demo. */
export function useDraftRecovery(
  scope: string | null,
  compose: Compose | null,
  files: File[],
) {
  const [loadedKey, setLoadedKey] = useState<string | null | undefined>(
    undefined,
  );
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [storageError, setStorageError] = useState("");
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = scope ? `compose:${scope}` : null;
  const activeKey = useRef(key); activeKey.current = key;

  useEffect(() => {
    let current = true;
    revision.current++;
    setSaved(null);
    setStatus("idle");
    setStorageError("");
    if (key)
      void transact<Snapshot | undefined>("readonly", (store) => store.get(key))
        .then((snapshot) => {
          let clearedAt = 0;
          try {
            clearedAt = Number(
              localStorage.getItem(`draft-cleared:${key}`) || 0,
            );
          } catch {}
          if (
            current &&
            snapshot?.compose &&
            Array.isArray(snapshot.files) &&
            Date.parse(snapshot.updatedAt) > clearedAt
          )
            setSaved(snapshot);
        })
        .catch(() => {
          if (current)
            setStorageError(
              "Device draft recovery is unavailable in this browser. Keep this tab open until you send or save your draft.",
            );
        })
        .finally(() => {
          if (current) setLoadedKey(key);
        });
    else setLoadedKey(null);
    return () => {
      current = false;
      clearTimeout(timer.current);
      revision.current++;
    };
  }, [key]);

  const save = useCallback(
    async (data: Compose, dataFiles: File[]) => {
      if (!key || !meaningful(data, dataFiles)) return;
      if (activeKey.current === key) clearTimeout(timer.current);
      const ownRevision = activeKey.current === key ? ++revision.current : -1;
      const snapshot: Snapshot = {
        key,
        compose: data,
        files: dataFiles,
        updatedAt: new Date().toISOString(),
      };
      if (activeKey.current === key) setStatus("saving");
      const task = chain.current
        .catch(() => {})
        .then(() => transact("readwrite", (store) => store.put(snapshot)));
      chain.current = task;
      try {
        await task;
        if (activeKey.current === key && revision.current === ownRevision) {
          setSaved(snapshot);
          setStatus("saved");
          setStorageError("");
        }
      } catch (error) {
        if (activeKey.current === key && revision.current === ownRevision) {
          setStatus("error");
          setStorageError(
            "Your draft could not be saved on this device. Keep the composer open to avoid losing it.",
          );
        }
        throw error;
      }
    },
    [key],
  );

  const clear = useCallback(async () => {
    if (activeKey.current === key) {
      clearTimeout(timer.current);
      revision.current++; setSaved(null); setStatus("idle"); setStorageError("");
    }
    if (!key) return;
    try {
      localStorage.setItem(`draft-cleared:${key}`, String(Date.now()));
    } catch {}
    const task = chain.current
      .catch(() => {})
      .then(() => transact("readwrite", (store) => store.delete(key)));
    chain.current = task;
    await task;
  }, [key]);

  useEffect(() => {
    if (!key || !compose) return;
    setStatus(meaningful(compose, files) ? "saving" : "idle");
    timer.current = setTimeout(() => {
      void (meaningful(compose, files) ? save(compose, files) : clear()).catch(
        () => {},
      );
    }, 500);
    return () => clearTimeout(timer.current);
  }, [key, compose, files, save, clear]);

  useEffect(() => {
    if (!compose || !meaningful(compose, files) || status === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [compose, files, status]);

  return {
    saved: loadedKey === key ? saved : null,
    status,
    storageError,
    save,
    clear,
    ready: loadedKey === key,
  };
}
