import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../public/sw-v2.js", import.meta.url), "utf8");
function worker() {
  const events = {}, opened = [];
  const self = { location: { origin: "https://mail.example.com" }, addEventListener: (name, callback) => events[name] = callback,
    clients: { matchAll: async () => [], openWindow: async url => opened.push(url) } };
  vm.runInNewContext(source, { self, URL, Response, fetch: async () => { throw new Error("offline"); } });
  return { events, opened };
}
test("notification clicks allow same-origin messages and reject external or malformed targets", async () => {
  for (const [url, expected] of [["/?message=123", "https://mail.example.com/?message=123"], ["https://attacker.example/", "https://mail.example.com/"], ["https://", "https://mail.example.com/"], ["javascript:alert(1)", "https://mail.example.com/"]]) {
    const { events, opened } = worker(); let task;
    events.notificationclick({ notification: { data: { url }, close() {} }, waitUntil: p => task = p });
    await task; assert.deepEqual(opened, [expected]);
  }
});
test("worker leaves authenticated API responses untouched and offline navigation contains no mailbox cache", async () => {
  const { events } = worker(); let response;
  events.fetch({ request: { mode: "cors", url: "https://backend.example/rest/v1/messages" }, respondWith: p => response = p });
  assert.equal(response, undefined);
  events.fetch({ request: { mode: "navigate", url: "https://mail.example.com/" }, respondWith: p => response = p });
  const offline = await response;
  assert.equal(offline.headers.get("cache-control"), "no-store");
  assert.match(await offline.text(), /Reconnect to load your mailbox/);
});
