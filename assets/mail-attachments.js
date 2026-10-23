// Shared by the classic reader, conversation dialog and standalone message view.
const jobs = new WeakMap();
const BUCKET = "frankiflow-mail-attachments";
function icon(name) {
  const element = document.createElement("span");
  element.className = "material-symbols-rounded";
  element.setAttribute("aria-hidden", "true");
  element.textContent = name;
  return element;
}
function bytes(size = 0) {
  return size < 1024
    ? `${size} B`
    : size < 1048576
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1048576).toFixed(1)} MB`;
}
function button(label, glyph, action) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "ff-mini-btn";
  element.title = label;
  element.setAttribute("aria-label", label);
  element.append(icon(glyph));
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    void action();
  });
  return element;
}

export async function renderMailAttachments(container, message, client) {
  if (!container || !message?.id) return;
  const job = Symbol(message.id);
  jobs.set(container, job);
  container
    .querySelectorAll(":scope > .ff-attachment-block")
    .forEach((element) => element.remove());
  container.dataset.ffAttachments = "loading";
  const block = document.createElement("section");
  block.className = "ff-attachment-block";
  block.setAttribute("aria-label", "Attachments");
  const title = document.createElement("div");
  title.className = "ff-attachment-title";
  title.textContent = "Loading attachments…";
  block.append(title);
  container.append(block);
  const current = () => container.isConnected && jobs.get(container) === job;
  const retry = (text) => {
    title.textContent = text;
    const control = document.createElement("button");
    control.type = "button";
    control.className = "btn";
    control.textContent = "Retry attachments";
    control.onclick = () => {
      void renderMailAttachments(container, message, client);
    };
    block.append(control);
  };
  try {
    // Always query the stored rows: has_attachments can be stale on sent messages.
    const { data, error } = await client
      .from("frankiflow_mail_attachments")
      .select("id,filename,content_type,size_bytes,storage_path")
      .eq("message_id", message.id)
      .order("created_at");
    if (!current()) return;
    if (error) throw error;
    const attachments = data || [];
    if (!attachments.length) {
      if (message.has_attachments) {
        block.setAttribute("role", "status");
        retry(
          "This message indicates attachments, but no saved files were returned. Retry or contact your mail administrator.",
        );
      } else block.remove();
      return;
    }
    title.replaceChildren(
      icon("attach_file"),
      document.createTextNode(
        ` ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`,
      ),
    );
    const grid = document.createElement("div");
    grid.className = "ff-attachment-grid";
    block.append(grid);
    for (const attachment of attachments) {
      const name = attachment.filename || "Attachment";
      const card = document.createElement("div");
      card.className = "ff-attachment-card";
      const fileIcon = document.createElement("div");
      fileIcon.className = "ff-attachment-icon";
      fileIcon.append(icon("description"));
      const meta = document.createElement("div");
      meta.className = "ff-attachment-meta";
      const filename = document.createElement("strong");
      filename.textContent = name;
      const details = document.createElement("small");
      details.textContent = `${attachment.content_type || "file"} · ${bytes(attachment.size_bytes)}`;
      const status = document.createElement("small");
      status.setAttribute("role", "alert");
      meta.append(filename, details, status);
      const controls = document.createElement("div");
      controls.className = "ff-attachment-actions";
      let busy = false;
      const access = async (download) => {
        if (busy) return;
        busy = true;
        status.textContent = "";
        let popup;
        try {
          if (!attachment.storage_path) throw new Error("No saved file path");
          // Open synchronously to preserve browser user activation; never keep an opener.
          if (!download) {
            popup = window.open("about:blank", "_blank");
            if (!popup) throw new Error("Pop-up blocked");
            popup.opener = null;
          }
          controls.querySelectorAll("button").forEach((element) => {
            element.disabled = true;
          });
          const { data, error } = await client.storage
            .from(BUCKET)
            .createSignedUrl(
              attachment.storage_path,
              60,
              download ? { download: name } : undefined,
            );
          if (error || !data?.signedUrl)
            throw error || new Error("File unavailable");
          const url = new URL(data.signedUrl, location.origin);
          if (!["https:", "http:"].includes(url.protocol))
            throw new Error("Invalid file URL");
          if (!current()) {
            popup?.close();
            return;
          }
          if (download) {
            const link = document.createElement("a");
            link.href = url.href;
            link.download = name;
            link.rel = "noopener noreferrer";
            document.body.append(link);
            link.click();
            link.remove();
          } else popup.location.replace(url.href);
        } catch (error) {
          popup?.close();
          if (current())
            status.textContent =
              error?.message === "Pop-up blocked"
                ? "Allow pop-ups to open this file, or use Download."
                : "This file could not be opened. Check your connection or sign in again, then retry.";
        } finally {
          busy = false;
          controls.querySelectorAll("button").forEach((element) => {
            element.disabled = false;
          });
        }
      };
      controls.append(
        button(`Open ${name}`, "open_in_new", () => access(false)),
        button(`Download ${name}`, "download", () => access(true)),
      );
      card.addEventListener("dblclick", (event) => {
        if (!event.target.closest("button,a")) void access(false);
      });
      card.append(fileIcon, meta, controls);
      grid.append(card);
    }
    container.dispatchEvent(
      new CustomEvent("ffmail:attachments-loaded", {
        bubbles: true,
        detail: { messageId: message.id, count: attachments.length },
      }),
    );
  } catch {
    if (current()) {
      block.setAttribute("role", "alert");
      retry("Attachments could not be loaded.");
    }
  } finally {
    if (current()) container.dataset.ffAttachments = "1";
  }
}
