export function deferred() { let resolve; const promise = new Promise(done => resolve = done); return { promise, resolve }; }
export function identity(id, email) {
  const user = { id, email, aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() };
  const jwt = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now()/1000) + 3600, role: "authenticated" })).toString("base64url")}.test-signature`;
  return { user, session: { access_token: jwt, refresh_token: `test-refresh-${id}`, expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, token_type: "bearer", user } };
}
export async function mailBackend(context) {
  const first = identity("10000000-0000-4000-8000-000000000001", "first@example.com"), second = identity("10000000-0000-4000-8000-000000000002", "second@example.com");
  const people = [first, second], state = { first, second, calls: [], pageErrors: [], accountGate: null, saveGate: null, sendGate: null, accountSettingsGate: null, failSettings: false, downloadGate: null, sockets: [], resourceErrors: new Set(), resources: {} };
  state.accounts = Object.fromEntries(people.map((person,index) => [person.user.id, [{ id: `20000000-0000-4000-8000-00000000000${index+1}`, address: person.user.email, display_name: index ? "Second sender" : "First sender", is_primary: true }]]));
  state.messages = Object.fromEntries(people.map(person => [person.user.id, []]));
  for (const person of people) state.resources[person.user.id] = Object.fromEntries(["contacts", "labels", "templates", "signatures", "filters", "events", "settings", "message_labels", "attachments"].map(key => [key, []]));
  await context.routeWebSocket("wss://*.supabase.co/**", socket => {
    const connection = { socket, topic: null, joinRef: null, id: 1, array: false }; state.sockets.push(connection);
    socket.onMessage(raw => {
      let message = JSON.parse(String(raw));
      if (Array.isArray(message)) { connection.array=true; message={join_ref:message[0],ref:message[1],topic:message[2],event:message[3],payload:message[4]}; }
      const send = data => socket.send(JSON.stringify(connection.array ? [data.join_ref || null,data.ref || null,data.topic,data.event,data.payload] : data));
      if (message.event === "phx_join") { connection.topic=message.topic; connection.joinRef=message.join_ref;
        send({ topic: message.topic, event: "phx_reply", ref: message.ref, join_ref: message.join_ref, payload: { status: "ok", response: { postgres_changes: [{ id: 1, event: "*", schema: "public", table: "frankiflow_mail_messages" }] } } });
      } else if (message.event === "heartbeat") send({ topic: "phoenix", event: "phx_reply", ref: message.ref, payload: { status: "ok", response: {} } });
    });
  });
  state.insertRealtime = row => {
    state.messages[first.user.id].push(row);
    for (const connection of state.sockets) if (connection.topic) {
      const message={topic:connection.topic,event:"postgres_changes",join_ref:connection.joinRef,payload:{ids:[1],data:{schema:"public",table:"frankiflow_mail_messages",type:"INSERT",columns:Object.keys(row).map(name=>({name,type:"text"})),record:row,old_record:{},commit_timestamp:new Date().toISOString(),errors:null}}};
      connection.socket.send(JSON.stringify(connection.array?[message.join_ref,null,message.topic,message.event,message.payload]:message));
    }
  };
  await context.route("https://*.supabase.co/**", async route => {
    const req = route.request(), url = new URL(req.url());
    const person = people.find(p => req.headers().authorization === `Bearer ${p.session.access_token}`) || first, owner = person.user.id;
    const reply = (body,status=200) => route.fulfill({ status, contentType: "application/json", ...(status===204 ? {} : { body: JSON.stringify(body) }) });
    if (url.pathname === "/auth/v1/token") return reply(people.find(p=>p.user.email===req.postDataJSON().email)?.session || person.session);
    if (url.pathname === "/auth/v1/user") return reply(person.user);
    if (url.pathname === "/auth/v1/logout") return reply(null,204);
    state.calls.push({ path: url.pathname, method: req.method(), owner, body: req.postDataJSON() });
    if (url.pathname === "/functions/v1/mail-push") return reply({ configured: false, subscriptionCount: 0 });
    if (url.pathname === "/functions/v1/send-mail") {
      if (state.sendGate) await state.sendGate.promise;
      return reply({ok:true,mail_message_id:"50000000-0000-4000-8000-000000000001"});
    }
    if (url.pathname === "/functions/v1/mail-account-settings") {
      if (state.accountSettingsGate) await state.accountSettingsGate.promise;
      for (const patch of req.postDataJSON().accounts) Object.assign(state.accounts[owner].find(a=>a.address===patch.address), patch);
      return reply({ ok: true, accounts: state.accounts[owner] });
    }
    if (url.pathname.startsWith("/storage/v1/object/frankiflow-mail-attachments/")) {
      if (state.downloadGate) await state.downloadGate.promise;
      return route.fulfill({status:200,contentType:"text/plain",body:"Private first-user attachment"});
    }
    const resource = url.pathname.match(/^\/rest\/v1\/frankiflow_mail_(.+)$/)?.[1];
    if (resource) {
      if (resource === "accounts" && state.accountGate) await state.accountGate.promise;
      if (resource === "settings" && state.failSettings && req.method()==="GET") return reply({ message: "Settings temporarily unavailable" },503);
      if (state.resourceErrors.has(resource)) return reply({ message: `${resource} unavailable` },503);
      let rows = resource === "accounts" ? state.accounts[owner] : resource === "messages" ? state.messages[owner] : state.resources[owner][resource];
      if (!rows) throw new Error(`Unmocked resource: ${resource}`);
      const id=url.searchParams.get("id")?.replace(/^eq\./, ""), isObject=req.headers().accept?.includes("vnd.pgrst.object");
      if (req.method()==="POST") {
        if (state.saveGate) await state.saveGate.promise;
        const input=req.postDataJSON(), entries=Array.isArray(input) ? input : [input];
        for (const row of entries) { const old=rows.find(x=>x.id===row.id || resource==="settings" && x.user_id===row.user_id); if(old)Object.assign(old,row);else rows.push({ created_at:new Date().toISOString(), from_name:"Test sender", ...row }); }
        return reply(isObject?rows.find(x=>x.id===entries[0].id)||entries[0]:entries);
      }
      if (req.method()==="PATCH") { for(const row of rows.filter(x=>!id||x.id===id))Object.assign(row,req.postDataJSON());return reply(isObject?rows.find(x=>x.id===id):rows); }
      if (req.method()==="DELETE") { for(let i=rows.length-1;i>=0;i--)if(rows[i].id===id)rows.splice(i,1);return reply(null,204); }
      const select=rows.filter(row=>!id||row.id===id); return reply(isObject?select[0]||null:select);
    }
    throw new Error(`Unmocked backend request: ${req.method()} ${url.pathname}`);
  });
  return state;
}
export async function signIn(page, base, person) {
  await page.goto(base);
  await page.getByRole("textbox",{name:"Email address",exact:true}).fill(person.user.email);
  await page.getByLabel("Password",{exact:true}).fill("fake-test-password");
  await page.getByRole("button",{name:"Sign in to your workspace",exact:true}).click();
  await page.getByRole("heading",{name:"Inbox",exact:false}).waitFor();
}
