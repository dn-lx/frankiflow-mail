import { getSupabase, attachmentBucket } from "./supabase";
import { recipients, validateFiles } from "./mail-utils.mjs";
import type { Compose, Account } from "./types";
// Save a replacement copy first. Never delete the user's previous draft before all files are durable.
export async function saveServerDraft(compose: Compose, files: File[], accounts: Account[]) {
  const fileError = validateFiles(files); if (fileError) throw new Error(fileError);
  const account = accounts.find(a => a.address === compose.fromAddress);
  if (!account) throw new Error("Choose an authorized sender account.");
  const id = crypto.randomUUID(); const client = getSupabase();
  const row = { id, account_id: account.id, thread_id: compose.thread_id || null, direction: "draft", folder: "drafts", from_address: account.address,
    to_addresses: recipients(compose.to), cc_addresses: recipients(compose.cc), bcc_addresses: recipients(compose.bcc), subject: compose.subject,
    text_body: compose.text, html_body: compose.html || "", preview: compose.text.slice(0, 180), is_read: true, has_attachments: files.length > 0, scheduled_at: compose.scheduledAt || null, updated_at: new Date().toISOString() };
  const paths: string[] = [];
  let created = false;
  try {
    const inserted = await client.from("frankiflow_mail_messages").insert(row); if (inserted.error) throw inserted.error; created = true;
    for (const file of files) {
      const fileId = crypto.randomUUID(), path = `${account.id}/${id}/${fileId}`;
      const metadata = await client.from("frankiflow_mail_attachments").insert({ id: fileId, message_id: id, filename: file.name, content_type: file.type || "application/octet-stream", size_bytes: file.size, storage_path: path });
      if (metadata.error) throw metadata.error;
      paths.push(path);
      const uploaded = await client.storage.from(attachmentBucket).upload(path, file, { contentType: file.type || "application/octet-stream" }); if (uploaded.error) throw uploaded.error;
    }
  } catch (error) {
    if (created) {
      try {
        if (paths.length) { const result = await client.storage.from(attachmentBucket).remove(paths); if (result.error) throw result.error; }
        await client.from("frankiflow_mail_messages").delete().eq("id", id).eq("folder", "drafts");
      } catch { /* The original draft and recovery copy remain intact. */ }
    }
    throw error;
  }
  let warning = "";
  if (compose.id && compose.id !== id) {
    try { await removeDraft(compose.id); }
    catch { warning = "The updated draft is saved, but its older copy could not be removed. Keep the newer draft."; }
  }
  return { id, warning };
}
export async function removeDraft(id: string) {
  const client = getSupabase();
  const original = await client.from("frankiflow_mail_messages").select("id,folder,direction").eq("id", id).maybeSingle();
  if (original.error) throw original.error;
  if (original.data && original.data.folder !== "drafts") throw new Error("This message is no longer a draft. Refresh the mailbox.");
  if (!original.data) return;
  if (original.data.direction === "outbound") throw new Error("Check delivery status before deleting this archived delivery attempt. Its saved files are kept for recovery.");
  const metadata = await client.from("frankiflow_mail_attachments").select("storage_path").eq("message_id", id);
  if (metadata.error) throw metadata.error;
  const paths = (metadata.data || []).map(file => file.storage_path).filter(Boolean);
  if (paths.length) { const result = await client.storage.from(attachmentBucket).remove(paths); if (result.error) throw result.error; }
  const deleted = await client.from("frankiflow_mail_messages").delete().eq("id", id).eq("folder", "drafts"); if (deleted.error) throw deleted.error;
}
