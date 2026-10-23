"use client";

import { useEffect, useState } from "react";

export function useSignatures(scope: string | null) {
  const key = scope ? `ffmail-v2-signatures:${scope}` : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    let saved: Record<string, string> = {};
    try {
      const parsed: unknown = key ? JSON.parse(localStorage.getItem(key) || "{}") : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        saved = Object.fromEntries(Object.entries(parsed).filter((entry) =>
          typeof entry[1] === "string" && entry[1].length <= 5000));
      }
    } catch {
      setError("Saved signatures could not be loaded in this browser.");
    }
    setValues(saved);
    setLoadedKey(key);
  }, [key]);

  function save(address: string, text: string) {
    if (!key || loadedKey !== key) return false;
    const next = { ...values, [address.toLowerCase()]: text };
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setValues(next);
      setError("");
      return true;
    } catch {
      setError("Signature could not be saved. Browser storage may be full or disabled.");
      return false;
    }
  }

  return { values: loadedKey === key ? values : {}, save, error, ready: loadedKey === key };
}
