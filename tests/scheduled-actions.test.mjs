import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../supabase/functions/mail-v2-actions/handler.mjs";
function fixture(options = {}) {
  const state = { cancels: 0, writes: [], folder: "scheduled", ...options };
  function from(table) {
    let patch, filteredFolder;
    const q = { select: () => q, eq: (key, value) => { if (key === "folder") filteredFolder = value; return q; }, maybeSingle: () => q, single: () => q, update: value => { patch = value; return q; }, then: (resolve, reject) => Promise.resolve().then(() => {
      if (table === "frankiflow_mail_users") return { data: { user_id: "qa" } };
      if (patch) { state.writes.push(patch); return state.failWrite ? { error: { message: "Write failed" } } : { data: { id: "message" } }; }
      if (state.inaccessible) return { data: null };
      return { data: { id: "message", folder: state.folder, direction: "outbound", provider_message_id: "provider", account_id: "account" } };
    }).then(resolve, reject) };
    return q;
  }
  const client = { from, auth: { getUser: async () => ({ data: { user: state.unauthorized ? null : { id: "qa" } } }) }, rpc: async () => ({ data: !state.readOnly }) };
  class Resend { emails = { cancel: async id => { state.cancels++; return state.providerReject ? { error: { message: "Already delivered" } } : { data: { id } }; }, get: async () => ({ data: { last_event: state.alreadyCanceled ? "canceled" : "delivered" } }) }; }
  const handle = createHandler({ createClient: () => client, Resend, env: () => "test" });
  async function request() { const response = await handle(new Request("https://example.com", { method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({ action: "cancel-scheduled", message_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }) })); return { status: response.status, data: await response.json() }; }
  return { state, request };
}
test("cancels with the provider before restoring a scheduled message to drafts", async () => {
  const { state, request } = fixture(); const result = await request();
  assert.equal(result.status, 200); assert.equal(result.data.ok, true); assert.equal(state.cancels, 1);
  assert.equal(state.writes[0].folder, "drafts"); assert.equal(state.writes[0].provider_message_id, null); assert.equal(state.writes[0].scheduled_at, null);
});
for (const [name, options, status] of [["unauthenticated", { unauthorized: true }, 401], ["inaccessible", { inaccessible: true }, 404], ["read-only", { readOnly: true }, 403], ["already sent", { folder: "sent" }, 400]]) test(`${name} messages cannot trigger provider cancellation`, async () => {
  const { state, request } = fixture(options); assert.equal((await request()).status, status); assert.equal(state.cancels, 0); assert.equal(state.writes.length, 0);
});
test("provider rejection retains the original schedule instead of pretending cancellation succeeded", async () => {
  const { state, request } = fixture({ providerReject: true }); const result = await request();
  assert.equal(result.status, 500); assert.match(result.data.error, /Already delivered/); assert.equal(state.writes.length, 0);
});
test("already-canceled provider schedules can safely retry mailbox bookkeeping", async () => {
  const { state, request } = fixture({ providerReject: true, alreadyCanceled: true }); assert.equal((await request()).data.ok, true); assert.equal(state.writes.length, 1);
});
test("canceled delivery remains successful when its mailbox update fails", async () => {
  const { request } = fixture({ failWrite: true }); const result = await request();
  assert.equal(result.status, 200); assert.equal(result.data.ok, true); assert.match(result.data.warning, /provider canceled delivery/);
});
