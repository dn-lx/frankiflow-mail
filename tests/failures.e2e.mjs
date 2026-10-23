import {chromium} from "playwright";
import assert from "node:assert/strict";
import {mailBackend, deferred, signIn} from "./helpers/mail-backend.mjs";
const base=process.env.BASE_URL||"http://127.0.0.1:3000";
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||"/usr/bin/chromium",args:["--no-sandbox","--disable-dev-shm-usage"]});
const failures=[];
async function check(name, action){const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:"reduce"});const state=await mailBackend(context),page=await context.newPage();page.setDefaultTimeout(7000);const errors=[];page.on("pageerror",e=>errors.push(e.message));try{await action(page,state);assert.deepEqual(errors,[]);console.log(`PASS ${name}`);}catch(e){failures.push(name);console.error(`FAIL ${name}: ${e.message.split("\n").slice(0,8).join("\n")}`);}finally{state.accountGate?.resolve();state.saveGate?.resolve();state.downloadGate?.resolve();state.sendGate?.resolve();state.accountSettingsGate?.resolve();await context.close();}}
try{
 await check("sender names load when accounts arrive after Settings opens",async(page,state)=>{
  state.accountGate=deferred();await signIn(page,base,state.first);
  await page.getByRole("button",{name:"Open settings",exact:true}).click();
  await page.getByText("Reading, accounts & notifications",{exact:true}).click();
  state.accountGate.resolve();
  const name=page.getByRole("textbox",{name:`Display name for ${state.first.user.email}`,exact:true});await name.waitFor();
  assert.equal(await name.inputValue(),"First sender");
 });
 await check("failed preferences load cannot overwrite existing settings; retry restores them",async(page,state)=>{
  state.failSettings=true;state.resources[state.first.user.id].settings.push({user_id:state.first.user.id,mark_read_on_open:false});
  await signIn(page,base,state.first);await page.getByRole("button",{name:"Open settings",exact:true}).click();
  await page.getByRole("alert").filter({hasText:"Settings temporarily unavailable"}).waitFor({timeout:15000});
  assert.equal(await page.getByRole("button",{name:"Save workspace preferences",exact:true}).count(),0);
  state.failSettings=false;await page.getByRole("button",{name:"Retry loading workspace",exact:true}).click();
  await page.getByText("Reading, accounts & notifications",{exact:true}).click();
  assert.equal(await page.getByRole("checkbox",{name:"Mark read on open",exact:true}).isChecked(),false);
  assert.equal(state.calls.filter(c=>c.path.endsWith("_settings")&&c.method==="POST").length,0);
 });
 await check("realtime INSERT refreshes Inbox and displays a new-mail notice",async(page,state)=>{
  await signIn(page,base,state.first);await page.waitForFunction(()=>Boolean(document.querySelector('.list-footer')));
  for(let i=0;i<50&&!state.sockets.some(s=>s.topic);i++)await page.waitForTimeout(50);
  assert.ok(state.sockets.some(s=>s.topic),"Realtime channel joined");
  state.insertRealtime({id:"30000000-0000-4000-8000-000000000001",account_id:state.accounts[state.first.user.id][0].id,from_name:"Taylor",from_address:"sender@example.com",to_addresses:[state.first.user.email],subject:"Realtime refresh regression",text_body:"Arrived over the test socket",folder:"inbox",direction:"inbound",is_read:false,is_starred:false,has_attachments:false,created_at:new Date().toISOString()});
  await page.locator(".row-content").filter({hasText:"Realtime refresh regression"}).waitFor();
  await page.getByRole("status").filter({hasText:"New mail: Realtime refresh regression"}).waitFor();
 });
 await check("a delayed resource save cannot expose another account's data after auth switches",async(page,state)=>{
  await signIn(page,base,state.first);await page.locator(".sidebar-tools").getByRole("button",{name:"Contacts",exact:true}).click();
  await page.getByRole("button",{name:"New contact",exact:true}).click();await page.getByLabel("Contact email",{exact:true}).fill("private-first@example.com");
  state.saveGate=deferred();await page.getByRole("button",{name:"Save",exact:true}).click();
  await page.waitForTimeout(100);
  await page.evaluate(session=>{localStorage.setItem("sb-bdeajozhylypiidrldka-auth-token",JSON.stringify(session));const channel=new BroadcastChannel("sb-bdeajozhylypiidrldka-auth-token");channel.postMessage({event:"SIGNED_IN",session});channel.close();},state.second.session);
  await page.getByText(state.second.user.email,{exact:true}).waitFor();state.saveGate.resolve();
  await page.locator(".sidebar-tools").getByRole("button",{name:"Contacts",exact:true}).click();
  assert.equal(await page.getByText("private-first@example.com",{exact:true}).count(),0);
 });
 for (const folder of ["inbox", "drafts"]) await check(`late ${folder} attachment fetch cannot open a previous account's composer`,async(page,state)=>{
  const id="40000000-0000-4000-8000-000000000001", account=state.accounts[state.first.user.id][0];
  state.messages[state.first.user.id].push({id,account_id:account.id,from_address:"private-sender@example.com",from_name:"Private sender",to_addresses:[state.first.user.email],subject:"Private first-user subject",text_body:"Private first-user body",folder,direction:folder==="drafts"?"draft":"inbound",is_read:true,is_starred:false,has_attachments:true,created_at:new Date().toISOString()});
  state.resources[state.first.user.id].attachments.push({id:"original-file",message_id:id,filename:"private-first.txt",content_type:"text/plain",size_bytes:29,storage_path:`${account.id}/${id}/original-file`});
  state.downloadGate=deferred();await signIn(page,base,state.first);
  if(folder==="drafts")await page.getByRole("navigation",{name:"Mail folders"}).getByRole("button",{name:/^Drafts/}).click();
  await page.locator(".row-content").filter({hasText:"Private first-user subject"}).click();
  if(folder!=="drafts")await page.getByRole("button",{name:"Forward with attachments",exact:true}).click();
  await page.evaluate(session=>{localStorage.setItem("sb-bdeajozhylypiidrldka-auth-token",JSON.stringify(session));const channel=new BroadcastChannel("sb-bdeajozhylypiidrldka-auth-token");channel.postMessage({event:"SIGNED_IN",session});channel.close();},state.second.session);
  await page.getByText(state.second.user.email,{exact:true}).waitFor();
  const response=page.waitForResponse(r=>r.url().includes("/storage/v1/object/"));state.downloadGate.resolve();await(await response).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.getByRole("dialog").count(),0);
  assert.equal(await page.getByText("Private first-user body",{exact:false}).count(),0);
 });

 await check("a completed send from the previous account cannot close the new account's composer",async(page,state)=>{
  await signIn(page,base,state.first);await page.getByRole("button",{name:"New message",exact:false}).click();
  await page.getByRole("combobox",{name:"To",exact:true}).fill("recipient@example.com");await page.getByRole("textbox",{name:"Message body",exact:true}).fill("First-user message");
  state.sendGate=deferred();const started=page.waitForRequest(r=>r.url().endsWith("/functions/v1/send-mail"));await page.getByRole("button",{name:"Send message",exact:true}).click();await started;
  await page.evaluate(session=>{localStorage.setItem("sb-bdeajozhylypiidrldka-auth-token",JSON.stringify(session));const channel=new BroadcastChannel("sb-bdeajozhylypiidrldka-auth-token");channel.postMessage({event:"SIGNED_IN",session});channel.close();},state.second.session);
  await page.getByText(state.second.user.email,{exact:true}).waitFor();await page.getByRole("button",{name:"New message",exact:false}).click();
  const response=page.waitForResponse(r=>r.url().endsWith("/functions/v1/send-mail"));state.sendGate.resolve();await(await response).finished();
  await page.getByRole("textbox",{name:"Message body",exact:true}).fill("Second-user message must remain open");
  assert.equal(await page.getByRole("textbox",{name:"Message body",exact:true}).inputValue(),"Second-user message must remain open");
  assert.equal(await page.getByRole("combobox",{name:"From",exact:true}).inputValue(),state.second.user.email);
  await page.getByText("Draft saved on this device",{exact:true}).waitFor();await page.reload();await page.getByRole("button",{name:"Resume draft",exact:false}).click();
  assert.equal(await page.getByRole("textbox",{name:"Message body",exact:true}).inputValue(),"Second-user message must remain open");
 });
 await check("a stale sender-settings response cannot restore the previous user's accounts",async(page,state)=>{
  await signIn(page,base,state.first);await page.getByRole("button",{name:"Open settings",exact:true}).click();await page.getByText("Reading, accounts & notifications",{exact:true}).click();
  await page.getByRole("textbox",{name:`Display name for ${state.first.user.email}`,exact:true}).fill("Edited first sender");
  state.accountSettingsGate=deferred();const started=page.waitForRequest(r=>r.url().endsWith("/functions/v1/mail-account-settings"));await page.getByRole("button",{name:"Save workspace preferences",exact:true}).click();await started;
  await page.evaluate(session=>{localStorage.setItem("sb-bdeajozhylypiidrldka-auth-token",JSON.stringify(session));const channel=new BroadcastChannel("sb-bdeajozhylypiidrldka-auth-token");channel.postMessage({event:"SIGNED_IN",session});channel.close();},state.second.session);
  await page.getByText(state.second.user.email,{exact:true}).waitFor();const response=page.waitForResponse(r=>r.url().endsWith("/functions/v1/mail-account-settings"));state.accountSettingsGate.resolve();await(await response).finished();
  await page.getByRole("button",{name:"New message",exact:false}).click();
  await page.getByRole("textbox",{name:"Message body",exact:true}).fill("Second-user composer");
  assert.equal(await page.getByRole("combobox",{name:"From",exact:true}).inputValue(),state.second.user.email);
  assert.equal(state.calls.filter(c=>c.path.endsWith("_settings")&&c.method==="POST"&&c.owner===state.second.user.id).length,0);
 });

 await check("denied notification permission is explained without registering a device",async(page,state)=>{
  await page.addInitScript(()=>Object.defineProperty(Notification,"requestPermission",{value:async()=>"denied"}));
  await signIn(page,base,state.first);await page.getByRole("button",{name:"Open settings",exact:true}).click();await page.getByText("Reading, accounts & notifications",{exact:true}).click();
  await page.getByRole("button",{name:"Enable this device",exact:true}).click();
  await page.getByRole("alert").filter({hasText:"Allow notifications in your browser settings"}).waitFor();
  assert.equal(state.calls.filter(c=>c.path==="/functions/v1/mail-push").length,0);
  assert.equal(await page.getByRole("button",{name:"Enable this device",exact:true}).isEnabled(),true);
 });
 await check("unconfigured push service reports failure without pretending registration succeeded",async(page,state)=>{
  await page.addInitScript(()=>Object.defineProperty(Notification,"requestPermission",{value:async()=>"granted"}));
  await signIn(page,base,state.first);await page.getByRole("button",{name:"Open settings",exact:true}).click();await page.getByText("Reading, accounts & notifications",{exact:true}).click();
  await page.getByRole("button",{name:"Enable this device",exact:true}).click();
  await page.getByRole("alert").filter({hasText:"has not configured background notifications"}).waitFor();
  assert.equal(state.calls.filter(c=>c.path==="/functions/v1/mail-push"&&c.body?.action==="subscribe").length,0);
  assert.equal(await page.getByRole("button",{name:"Send test notification",exact:true}).isDisabled(),true);
 });

}finally{await browser.close();}
assert.equal(failures.length,0,failures.join("; "));
console.log("10 authenticated failure and account-isolation groups passed");
