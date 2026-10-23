import { getSupabase, attachmentBucket } from "./supabase";
import { validateFiles } from "./mail-utils.mjs";
import type { Attachment, Message } from "./types";

export async function encodeFiles(files: File[]) {
  return Promise.all(
    files.map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return {
        filename: file.name,
        content: btoa(binary),
        contentType: file.type || "application/octet-stream",
      };
    }),
  );
}

export async function attachmentFiles(
  message: Message,
  demo: boolean,
  cache: Map<string, Attachment[]>,
) {
  let items = message.attachments || cache.get(message.id);
  if (!demo && !items) {
    const { data, error } = await getSupabase()
      .from("frankiflow_mail_attachments")
      .select("id,filename,content_type,size_bytes,storage_path")
      .eq("message_id", message.id)
      .order("created_at");
    if (error) throw error;
    items = data || [];
    cache.set(message.id, items);
  }
  items ||= [];
  if (message.has_attachments && !items.length)
    throw new Error(
      "The original files are unavailable. Forwarding has been stopped so attachments are not silently omitted.",
    );
  const metadataError = validateFiles(
    items.map((item) => ({ size: item.size_bytes > 0 ? item.size_bytes : 1 })),
  );
  if (metadataError) throw new Error(metadataError);
  const files: File[] = [];
  for (const item of items) {
    let blob: Blob;
    if (demo) {
      if (!item.dataUrl?.startsWith("data:"))
        throw new Error("Invalid sample attachment.");
      blob = await (await fetch(item.dataUrl)).blob();
    } else {
      if (!item.storage_path)
        throw new Error("An attachment storage path is missing.");
      const { data, error } = await getSupabase()
        .storage.from(attachmentBucket)
        .download(item.storage_path);
      if (error) throw error;
      blob = data;
    }
    if (item.size_bytes > 0 && blob.size !== item.size_bytes) throw new Error(`The attachment ${item.filename} could not be downloaded completely. Try again before forwarding.`);
    files.push(
      new File([blob], item.filename, {
        type: item.content_type || blob.type || "application/octet-stream",
      }),
    );
    const fileError = validateFiles(files);
    if (fileError) throw new Error(fileError);
  }
  return files;
}

/** Extract a forward quote from HTML-only mail without executing or loading its markup. */
export function messageText(message: Message) {
  if (message.text_body?.trim() || !message.html_body) return message.text_body || "";
  const template = document.createElement("template");
  template.innerHTML = message.html_body;
  template.content.querySelectorAll("script,style,iframe,object,embed,head").forEach(element => element.remove());
  template.content.querySelectorAll("br").forEach(element => element.replaceWith(document.createTextNode("\n")));
  template.content.querySelectorAll("p,div,li,tr,blockquote,h1,h2,h3").forEach(element => element.appendChild(document.createTextNode("\n")));
  return (template.content.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}
