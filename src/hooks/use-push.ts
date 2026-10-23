"use client";
import { useEffect, useState } from "react";
import { invokeMail } from "./use-workspace";
export function usePush(demo: boolean, userId: string | undefined) {
  const [active, setActive] = useState(false), [status, setStatus] = useState("Notifications are off on this device."), [busy, setBusy] = useState(false);
  function supported() { return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext; }
  async function worker() {
    if (!supported()) throw new Error("Background notifications require a supported browser and HTTPS.");
    await navigator.serviceWorker.register("/sw-v2.js", { scope: "/" });
    return navigator.serviceWorker.ready;
  }
  useEffect(() => {
    setActive(false);
    if (demo || !userId || !supported()) return;
    let current = true;
    void worker().then(async reg => {
      const subscription = await reg.pushManager.getSubscription();
      if (!current) return;
      const owner = localStorage.getItem("ffmail-v2-push-owner");
      if (subscription && owner !== userId) { await subscription.unsubscribe(); localStorage.removeItem("ffmail-v2-push-owner"); }
      else if (subscription) { setActive(true); setStatus("Background notifications are enabled on this device."); }
    }).catch(e => { if (current) setStatus(e.message); });
    return () => { current = false; };
  }, [demo, userId]);
  async function enable() {
    if (demo) throw new Error("Sign in to enable real mail notifications.");
    if (!supported()) throw new Error("This browser does not support background notifications.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Allow notifications in your browser settings to enable this device.");
    setBusy(true);
    try {
      const config = await invokeMail("mail-push", { action: "config" });
      if (!config?.configured || !config.publicKey) throw new Error("The mail server has not configured background notifications.");
      const reg = await worker();
      let subscription = await reg.pushManager.getSubscription();
      const raw = atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/"));
      const key = Uint8Array.from(raw, c => c.charCodeAt(0));
      const oldKey = subscription?.options.applicationServerKey;
      if (subscription && oldKey && (new Uint8Array(oldKey).length !== key.length || !new Uint8Array(oldKey).every((value, index) => value === key[index]))) { await subscription.unsubscribe(); subscription = null; }
      subscription ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await invokeMail("mail-push", { action: "subscribe", subscription: subscription.toJSON(), userAgent: navigator.userAgent, deviceName: "FrankiFlow Mail v2" });
      localStorage.setItem("ffmail-v2-push-owner", userId || ""); setActive(true); setStatus("Background notifications are enabled on this device.");
    } finally { setBusy(false); }
  }
  async function disable() {
    if (demo || !supported()) return;
    setBusy(true);
    try {
      const reg = await worker(), sub = await reg.pushManager.getSubscription();
      if (sub) {
        try { await invokeMail("mail-push", { action: "unsubscribe", endpoint: sub.endpoint }); }
        finally { await sub.unsubscribe(); }
      }
      localStorage.removeItem("ffmail-v2-push-owner"); setActive(false); setStatus("Notifications are off on this device.");
    } finally { localStorage.removeItem("ffmail-v2-push-owner"); setActive(false); setStatus("Notifications are off on this device."); setBusy(false); }
  }
  async function test() { const result = await invokeMail("mail-push", { action: "test" }); if (!result?.delivered) throw new Error("No notification was delivered. Repair this device registration and retry."); setStatus("Test notification sent to your registered devices."); }
  return { active, status, busy, enable, disable, test };
}
