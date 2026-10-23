(() => {
  const now = new Date().toISOString();
  const account = {
    id: "account",
    address: "info@frankiflow.de",
    display_name: "FrankiFlow",
    is_primary: true,
  };
  const common = {
    account_id: account.id,
    thread_id: "conversation",
    is_read: true,
    is_starred: false,
    is_pinned: false,
    priority: "normal",
    created_at: now,
  };
  const inbound = {
    ...common,
    id: "inbound",
    from_name: "Client",
    from_address: "client@example.com",
    to_addresses: [account.address],
    subject: "Attachment conversation",
    text_body: "An incoming file",
    folder: "inbox",
    direction: "inbound",
    has_attachments: true,
    created_at: "2026-10-01T09:00:00Z",
  };
  const sent = {
    ...common,
    id: "sent",
    from_name: "FrankiFlow",
    from_address: account.address,
    to_addresses: ["client@example.com"],
    subject: "Attachment conversation",
    text_body: "The sent receipt",
    folder: "sent",
    direction: "outbound",
    has_attachments: false,
    created_at: "2026-10-01T10:00:00Z",
  };
  const test = (window.__mailTest = {
    metadataError: false,
    signError: false,
    failSend: false,
    failDraftCleanup: false,
    draftDelay: 0,
    draftStarted: false,
    events: [],
    payloads: [],
    authCallbacks: [],
    attachmentReads: [],
    fileCopies: {
      "sent/receipt.txt": btoa("Receipt from Sent"),
      "inbound/invoice.txt": btoa("Incoming invoice"),
    },
    tables: {
      frankiflow_mail_messages: [sent, inbound],
      frankiflow_mail_accounts: [account],
      frankiflow_mail_attachments: [
        {
          id: "file-sent",
          message_id: "sent",
          filename: "sent-receipt.txt",
          content_type: "text/plain",
          size_bytes: 17,
          storage_path: "sent/receipt.txt",
        },
        {
          id: "file-inbound",
          message_id: "inbound",
          filename: "incoming-invoice.txt",
          content_type: "text/plain",
          size_bytes: 16,
          storage_path: "inbound/invoice.txt",
        },
      ],
      frankiflow_mail_settings: [{ user_id: "user", conversation_view: true }],
      frankiflow_mail_labels: [],
      frankiflow_mail_message_labels: [],
      frankiflow_mail_contacts: [],
      frankiflow_mail_templates: [],
      frankiflow_mail_signatures: [],
      frankiflow_mail_filters: [],
      frankiflow_mail_events: [],
    },
  });
  let sequence = 0;
  const session = {
    access_token: "synthetic-session",
    user: { id: "user", email: "person@example.com" },
  };
  function from(table) {
    let operation = "select",
      values,
      filters = [],
      single = false;
    const query = {
      select() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      eq(key, value) {
        filters.push((row) => row[key] === value);
        return query;
      },
      in(key, ids) {
        filters.push((row) => ids.includes(row[key]));
        return query;
      },
      is(key, value) {
        filters.push((row) => row[key] === value);
        return query;
      },
      maybeSingle() {
        single = true;
        return query;
      },
      single() {
        single = true;
        return query;
      },
      update(row) {
        operation = "update";
        values = row;
        return query;
      },
      insert(row) {
        operation = "insert";
        values = row;
        return query;
      },
      upsert(row) {
        operation = "insert";
        values = row;
        return query;
      },
      delete() {
        operation = "delete";
        return query;
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };
    async function execute() {
      const rows = (test.tables[table] ||= []);
      if (
        table === "frankiflow_mail_contacts" &&
        operation !== "select" &&
        test.failContacts
      )
        return { data: null, error: { message: "Contacts update denied" } };
      if (table === "frankiflow_mail_attachments") {
        test.attachmentReads.push(operation);
        if (test.metadataError)
          return { data: null, error: { message: "Attachment list denied" } };
      }
      if (
        operation === "delete" &&
        table === "frankiflow_mail_messages" &&
        test.failDraftCleanup
      )
        return { data: null, error: { message: "Draft cleanup denied" } };
      let selected = rows.filter((row) =>
        filters.every((filter) => filter(row)),
      );
      if (operation === "insert") {
        if (
          table === "frankiflow_mail_messages" &&
          values.direction === "draft"
        ) {
          test.draftStarted = true;
          if (test.draftDelay)
            await new Promise((resolve) =>
              setTimeout(resolve, test.draftDelay),
            );
          test.events.push("draft-save");
        }
        const added = (Array.isArray(values) ? values : [values]).map(
          (row) => ({ id: `generated-${++sequence}`, created_at: now, ...row }),
        );
        rows.push(...added);
        selected = added;
      }
      if (operation === "update")
        selected.forEach((row) => Object.assign(row, values));
      if (operation === "delete")
        test.tables[table] = rows.filter((row) => !selected.includes(row));
      const data = JSON.parse(
        JSON.stringify(single ? selected[0] || null : selected),
      );
      return { data, error: null };
    }
    return query;
  }
  test.client = {
    from,
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session.user }, error: null }),
      onAuthStateChange(callback) {
        test.authCallbacks.push(callback);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    storage: {
      from() {
        return {
          async createSignedUrl(path, _ttl, options) {
            if (test.signError)
              return { data: null, error: { message: "Download denied" } };
            await window.__writeAttachmentFixture(path, test.fileCopies[path]);
            return {
              data: {
                signedUrl: `${location.origin}/test-results/file-downloads/${encodeURIComponent(path)}${options?.download ? "?download=1" : ""}`,
              },
              error: null,
            };
          },
          remove: async () => ({ error: null }),
        };
      },
    },
    functions: {
      async invoke(_name, { body }) {
        test.payloads.push(body);
        test.events.push("send");
        if (test.failSend)
          return { data: null, error: { message: "Transport unavailable" } };
        const id = `outbound-${++sequence}`;
        test.tables.frankiflow_mail_messages.unshift({
          ...common,
          id,
          from_name: "FrankiFlow",
          from_address: body.fromAddress,
          to_addresses: body.to,
          cc_addresses: body.cc || [],
          subject: body.subject,
          text_body: body.text,
          html_body: body.html,
          folder: body.scheduledAt ? "scheduled" : "sent",
          direction: "outbound",
          has_attachments: Boolean(body.attachments?.length),
        });
        for (const file of body.attachments || []) {
          const path = `${id}/${file.filename}`;
          test.fileCopies[path] = file.content;
          test.tables.frankiflow_mail_attachments.push({
            id: `attachment-${++sequence}`,
            message_id: id,
            filename: file.filename,
            content_type: file.contentType || "application/octet-stream",
            size_bytes: atob(file.content).length,
            storage_path: path,
          });
        }
        return { data: { message_id: id }, error: null };
      },
    },
    channel() {
      const channel = {
        on() {
          return channel;
        },
        subscribe() {
          return channel;
        },
      };
      return channel;
    },
    removeChannel: async () => {},
  };
})();
