import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, decodeAttachments } from "../supabase/functions/send-mail/handler.mjs";

const account = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", address: "sender@example.com", display_name: "Sender" };
const pdf = new Uint8Array([37, 80, 68, 70, 45, 0, 255, 128, 10]);
const attachment = { filename: "manifest-in-action.pdf", contentType: "application/pdf", content: Buffer.from(pdf).toString("base64") };
function fixture(options = {}) {
  const state = { events: [], tables: { frankiflow_mail_users: [{ user_id: "user", active: true }],
    frankiflow_mail_accounts: [account], frankiflow_mail_messages: [], frankiflow_mail_attachments: [], frankiflow_mail_threads: [],
    frankiflow_mail_user_accounts: [{ user_id: "user", account_id: account.id, can_send: true, is_default: true }] }, files: new Map(), sends: 0, ...options };
  function from(table) {
    let operation = "select", values, single = false, filters = [];
    const query = {
      select() { return query; }, order() { return query; }, limit() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      maybeSingle() { single = true; return query; }, single() { single = true; return query; },
      insert(value) { operation = "insert"; values = value; return query; },
      upsert(value) { operation = "upsert"; values = value; return query; },
      update(value) { operation = "update"; values = value; return query; },
      delete() { operation = "delete"; return query; },
      then(resolve, reject) {
        const execute = () => {
          state.events.push(`${table}:${operation}`);
          if (table === "frankiflow_mail_attachments" && operation === "insert" && state.failMetadata) return { error: { message: "Metadata denied" } };
          if (table === "frankiflow_mail_messages" && operation === "update" && values.folder && state.failSentUpdate) return { error: { message: "Sent update denied" } };
          const rows = state.tables[table] || [], selected = rows.filter(row => filters.every(filter => filter(row)));
          let result = selected;
          if (operation === "select" && table === "frankiflow_mail_messages" && state.denyMessageRead) result = [];
          if (operation === "insert" || operation === "upsert") {
            result = (Array.isArray(values) ? values : [values]).map(row => ({ ...row }));
            for (const row of result) {
              const existing = operation === "upsert" && rows.find(item => item.id === row.id);
              if (existing) Object.assign(existing, row); else rows.push(row);
            }
          }
          if (operation === "update") selected.forEach(row => Object.assign(row, values));
          if (operation === "delete") {
            state.tables[table] = rows.filter(row => !selected.includes(row));
            if (table === "frankiflow_mail_messages") state.tables.frankiflow_mail_attachments = state.tables.frankiflow_mail_attachments.filter(file => !selected.some(row => row.id === file.message_id));
          }
          return { data: single ? result[0] || null : result, error: null };
        };
        return Promise.resolve().then(execute).then(resolve, reject);
      },
    };
    return query;
  }
  const client = { from, rpc: async () => ({ data: state.canSend !== false, error: null }),
    auth: { getUser: async () => ({ data: { user: state.unauthorized ? null : { id: "user" } }, error: null }) },
    storage: { from: () => ({
      upload: async (path, bytes) => {
        state.events.push("upload");
        if (state.failUpload) return { error: { message: "Upload failed" } };
        state.files.set(path, new Uint8Array(bytes));
        return { data: { path }, error: null };
      },
      download: async path => state.files.has(path) ? { data: new Blob([state.files.get(path)]), error: null } : { data: null, error: { message: "Not found" } },
      remove: async paths => { paths.forEach(path => state.files.delete(path)); return { data: [], error: null }; },
    }) },
  };
  class Resend {
    emails = {
      send: async (payload, request) => {
        state.sends++; state.events.push("provider-send"); state.payload = payload; state.providerRequest = request;
        if (state.networkFailure) throw new Error("Provider response lost");
        if (state.failProvider) return { error: { message: "Provider rejected message", statusCode: 422 } };
        if (state.sdkNetworkFailure) return { data: null, error: { name: "application_error", statusCode: null, message: "Unable to fetch data" } };
        return { data: { id: "provider-id" }, error: null };
      },
      get: async () => ({ data: { message_id: "<rfc-id@example.com>" }, error: null }),
      attachments: {
        list: async ({ emailId }) => {
          state.recoveryEmailId = emailId;
          return { data: { data: state.noProviderFiles ? [] : [{ id: "provider-file", filename: attachment.filename }], has_more: false }, error: null };
        },
        get: async () => ({ data: { download_url: "https://downloads.example.com/original", filename: attachment.filename, size: state.wrongSize ? 500 : pdf.length, content_type: "application/pdf" }, error: null }),
      },
    };
  }
  const handler = createHandler({ createClient: () => client, Resend,
    env: name => ({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public", SUPABASE_SERVICE_ROLE_KEY: "test-service-only", RESEND_API_KEY: "test-provider" })[name],
    fetchImpl: async url => url.includes("/auth/v1/admin/users") ? Response.json({}, { status: state.adminProbeAllowed ? 200 : 403 }) : new Response(pdf), logger: { warn() {}, error() {} },
  });
  async function request(body = {}, token = "user", origin = "https://develop--frankiflow-mail.netlify.app") {
    const response = await handler(new Request("https://example.supabase.co/functions/v1/send-mail", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Origin: origin },
      body: JSON.stringify({ fromAddress: account.address, to: ["recipient@example.com"], subject: "Test", text: "Attached", attachments: [attachment], ...body }) }));
    return { status: response.status, body: await response.json(), response };
  }
  function historical() {
    const message = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", account_id: account.id, direction: "outbound", folder: "sent", provider_message_id: "historical-provider", has_attachments: true };
    state.tables.frankiflow_mail_messages.push(message);
    return message;
  }
  return { state, request, historical };
}

test("saves exact attachment bytes and internal message metadata before provider delivery", async () => {
  const { state, request } = fixture();
  const result = await request();
  assert.equal(result.status, 200);
  assert.equal(result.body.attachments_archived, 1);
  const message = state.tables.frankiflow_mail_messages[0], stored = state.tables.frankiflow_mail_attachments[0];
  assert.equal(message.folder, "sent"); assert.equal(message.provider_message_id, "provider-id");
  assert.equal(stored.message_id, message.id); assert.notEqual(stored.message_id, message.provider_message_id);
  assert.equal(stored.size_bytes, pdf.length); assert.equal(stored.filename, attachment.filename);
  assert.deepEqual(state.files.get(stored.storage_path), pdf);
  assert.ok(stored.storage_path.startsWith(account.id + "/"));
  assert.ok(state.events.indexOf("upload") < state.events.indexOf("provider-send"));
  assert.ok(state.events.indexOf("frankiflow_mail_attachments:insert") < state.events.indexOf("provider-send"));
  assert.equal(state.providerRequest.idempotencyKey, `frankiflow-mail:${message.id}`);
  assert.equal(result.body.mail_message_id, message.id);
});
for (const [name, option] of [["storage", "failUpload"], ["metadata", "failMetadata"]]) {
  test(`${name} failure prevents delivery and cleans only the staged message`, async () => {
    const { state, request } = fixture({ [option]: true });
    state.tables.frankiflow_mail_messages.push({ id: "original-draft", folder: "drafts" });
    const result = await request({ draft_id: "original-draft" });
    assert.equal(result.status, 500); assert.equal(state.sends, 0);
    assert.deepEqual(state.tables.frankiflow_mail_messages, [{ id: "original-draft", folder: "drafts" }]);
    assert.equal(state.tables.frankiflow_mail_attachments.length, 0); assert.equal(state.files.size, 0);
  });
}
test("provider rejection cleans uploaded staged copies without changing the original draft", async () => {
  const { state, request } = fixture({ failProvider: true });
  const result = await request(); assert.equal(result.status, 500);
  assert.equal(state.tables.frankiflow_mail_messages.length, 0); assert.equal(state.files.size, 0);
});
test("delivered email stays successful after a failed Sent status update; files survive", async () => {
  const { state, request } = fixture({ failSentUpdate: true });
  const result = await request(); assert.equal(result.status, 200); assert.equal(result.body.ok, true);
  assert.match(result.body.warning, /Do not resend/); assert.equal(result.body.error, undefined);
  assert.equal(state.files.size, 1); assert.equal(state.tables.frankiflow_mail_attachments.length, 1);
});
test("read-only sender authorization is checked before storage and provider calls", async () => {
  const { state, request } = fixture({ canSend: false });
  assert.equal((await request()).status, 403); assert.equal(state.sends, 0); assert.equal(state.files.size, 0);
});
test("unauthenticated requests cannot send or recover attachments", async () => {
  const { state, request, historical } = fixture({ unauthorized: true });
  const message = historical();
  assert.equal((await request()).status, 401);
  assert.equal((await request({ action: "repair-attachments", message_id: message.id }, "wrong-service-key")).status, 401);
  assert.equal(state.sends, 0); assert.equal(state.recoveryEmailId, undefined);
});
test("recovery checks message access through RLS before any privileged writes", async () => {
  const { state, request, historical } = fixture({ denyMessageRead: true });
  const message = historical();
  assert.equal((await request({ action: "repair-attachments", message_id: message.id })).status, 404);
  assert.equal(state.recoveryEmailId, undefined); assert.equal(state.files.size, 0);
});
test("historical PDF recovery is idempotent, exact, and never sends email", async () => {
  const { state, request, historical } = fixture(); const message = historical();
  const body = { action: "repair-attachments", message_id: message.id };
  const first = await request(body, "test-service-only"); const second = await request(body, "test-service-only");
  assert.equal(first.status, 200); assert.deepEqual(second.body, first.body);
  assert.equal(first.body.files[0].size_bytes, pdf.length); assert.match(first.body.files[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(state.tables.frankiflow_mail_attachments.length, 1); assert.equal(state.files.size, 1);
  assert.deepEqual([...state.files.values()][0], pdf); assert.equal(state.sends, 0);
  assert.equal(state.recoveryEmailId, "historical-provider");
});
test("unavailable provider originals produce a visible error without clearing attachment flags", async () => {
  const { state, request, historical } = fixture({ noProviderFiles: true }); const message = historical();
  const result = await request({ action: "repair-attachments", message_id: message.id });
  assert.equal(result.status, 404); assert.match(result.body.error, /do not resend/i);
  assert.equal(message.has_attachments, true); assert.equal(state.sends, 0);
});
test("truncated recovered files fail size verification before writing", async () => {
  const { state, request, historical } = fixture({ wrongSize: true }); const message = historical();
  assert.equal((await request({ action: "repair-attachments", message_id: message.id })).status, 500);
  assert.equal(state.files.size, 0); assert.equal(state.tables.frankiflow_mail_attachments.length, 0);
});
test("rejects excessive file counts and malformed base64 rather than silently dropping files", () => {
  assert.throws(() => decodeAttachments(Array(15).fill(attachment)), /at most 14/);
  assert.throws(() => decodeAttachments([{ ...attachment, content: "bad!" }]), /invalid/);
  assert.throws(() => decodeAttachments([{ ...attachment, content: "A".repeat(12_000_000) }]), /8 MB/);
});
test("scheduled mail stores files before submitting its schedule", async () => {
  const { state, request } = fixture();
  const scheduledAt = new Date(Date.now() + 3600000).toISOString();
  assert.equal((await request({ scheduledAt })).status, 200);
  assert.equal(state.tables.frankiflow_mail_messages[0].folder, "scheduled");
  assert.equal(state.payload.scheduledAt, scheduledAt); assert.equal(state.files.size, 1);
});
test("v2 origins are allowed while authentication remains required", async () => {
  for (const origin of ["https://v2--frankiflow-mail.netlify.app", "https://v2--frankiholz.netlify.app"]) {
    const { state, request } = fixture({ unauthorized: true });
    const result = await request({}, "invalid-user", origin);
    assert.equal(result.response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.equal(result.status, 401); assert.equal(state.sends, 0);
  }
});

test("ambiguous provider network failure keeps the original archived bytes for recovery", async () => {
  const { state, request } = fixture({ networkFailure: true });
  const result = await request();
  assert.equal(result.status, 502); assert.equal(result.body.delivery_unconfirmed, true);
  assert.match(result.body.error, /do not resend automatically/);
  assert.equal(state.files.size, 1); assert.equal(state.tables.frankiflow_mail_messages.length, 1);
});

test("recovering a file already archived by send does not duplicate its metadata", async () => {
  const { state, request } = fixture();
  const sent = await request();
  const result = await request({ action: "repair-attachments", message_id: sent.body.mail_message_id });
  assert.equal(result.status, 200); assert.equal(state.files.size, 1);
  assert.equal(state.tables.frankiflow_mail_attachments.length, 1); assert.equal(state.sends, 1);
});

test("alternate service JWTs require successful verification by the Auth admin endpoint", async () => {
  const jwt = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
  for (const allowed of [false, true]) {
    const { state, request, historical } = fixture({ unauthorized: true, adminProbeAllowed: allowed });
    const message = historical();
    const result = await request({ action: "repair-attachments", message_id: message.id }, jwt);
    assert.equal(result.status, allowed ? 200 : 401);
    assert.equal(state.files.size, allowed ? 1 : 0);
  }
});

test("SDK transport errors returned as data retain attachment recovery copies", async () => {
  const { state, request } = fixture({ sdkNetworkFailure: true });
  const result = await request();
  assert.equal(result.status, 502); assert.equal(result.body.delivery_unconfirmed, true);
  assert.equal(state.files.size, 1); assert.equal(state.tables.frankiflow_mail_attachments.length, 1);
});

test("stores the original inline HTML while the delivery payload uses CID references", async () => {
  const { state, request } = fixture();
  const result = await request({ html: '<img src="cid:logo">', archive_html: '<img src="data:image/png;base64,AA==">' });
  assert.equal(result.status, 200);
  assert.equal(state.payload.html, '<img src="cid:logo">');
  assert.equal(state.tables.frankiflow_mail_messages[0].html_body, '<img src="data:image/png;base64,AA==">');
});
