from pathlib import Path

app_path = Path('assets/app.js')
css_path = Path('assets/modern.css')
sw_path = Path('sw.js')
app = app_path.read_text()
css = css_path.read_text()
sw = sw_path.read_text()

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing expected snippet: {label}')
    return text.replace(old, new, 1)

old_accounts = """const accounts=state.accounts.map(a=>`<div class=\"account-setting-row\"><span>${icon(a.is_primary?'mark_email_read':'alternate_email')}</span><div><strong>${esc(a.address)}</strong><small>${a.is_primary?'Primary sender':'Secondary sender'}</small></div></div>`).join('');"""
new_accounts = """const accounts=state.accounts.map(a=>`<div class=\"account-setting-row editable\" data-account-row=\"${a.id}\"><span>${icon(a.is_primary?'mark_email_read':'alternate_email')}</span><div class=\"account-setting-main\"><strong>${esc(a.address)}</strong><small>${a.is_primary?'Routing account · verified':'Additional account · verified'}</small><div class=\"account-edit-grid\"><label><span>Display name</span><input class=\"account-display-name\" data-account-address=\"${esc(a.address)}\" value=\"${esc(a.display_name||'FrankiFlow')}\" maxlength=\"80\"></label><label class=\"account-default\"><input type=\"radio\" name=\"accountDefault\" value=\"${esc(a.address)}\"><span>Default sender</span></label></div></div></div>`).join('');"""
app = replace_once(app, old_accounts, new_accounts, 'editable mail accounts')

app = replace_once(
    app,
    "openModal('Settings',content,async modal=>{await saveSettings({",
    "openModal('Settings',content,async modal=>{if(!await saveMailAccountSettings(modal))return;await saveSettings({",
    'save account settings before preferences',
)

app = replace_once(
    app,
    "default_sender_address:modal.querySelector('#setDefaultSender').value",
    "default_sender_address:modal.querySelector('input[name=\"accountDefault\"]:checked')?.value||modal.querySelector('#setDefaultSender').value",
    'default sender radio',
)

old_default_ready = "modal.querySelector('#setDefaultSender').value=s.default_sender_address||defaultFromAddress();"
new_default_ready = """const configuredDefault=s.default_sender_address||defaultFromAddress();modal.querySelector('#setDefaultSender').value=configuredDefault;const defaultRadio=modal.querySelector(`input[name=\"accountDefault\"][value=\"${CSS.escape(configuredDefault)}\"]`);if(defaultRadio)defaultRadio.checked=true;modal.querySelectorAll('input[name=\"accountDefault\"]').forEach(r=>r.onchange=()=>{if(r.checked)modal.querySelector('#setDefaultSender').value=r.value;});modal.querySelector('#setDefaultSender').onchange=e=>{const r=modal.querySelector(`input[name=\"accountDefault\"][value=\"${CSS.escape(e.target.value)}\"]`);if(r)r.checked=true;};"""
app = replace_once(app, old_default_ready, new_default_ready, 'sync account default sender controls')

for old, new, label in [
    ("modal.querySelector('#manageSignaturesBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openSignatureManager()};", "modal.querySelector('#manageSignaturesBtn').onclick=()=>openSignatureManager();", 'settings signatures navigation'),
    ("modal.querySelector('#manageLabelsBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openLabelManager()};", "modal.querySelector('#manageLabelsBtn').onclick=()=>openLabelManager();", 'settings labels navigation'),
    ("modal.querySelector('#manageTemplatesBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openTemplateManager()};", "modal.querySelector('#manageTemplatesBtn').onclick=()=>openTemplateManager();", 'settings templates navigation'),
    ("modal.querySelector('#manageFiltersBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openFilterManager()};", "modal.querySelector('#manageFiltersBtn').onclick=()=>openFilterManager();", 'settings filters navigation'),
    ("modal.querySelector('#shortcutsBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();showShortcuts()};", "modal.querySelector('#shortcutsBtn').onclick=()=>showShortcuts();", 'settings shortcuts navigation'),
]:
    app = replace_once(app, old, new, label)

ai_old = "if(error||data?.error){save.disabled=false;save.textContent='Generate';return toast(data?.error||error?.message||'AI request failed','error');}"
ai_new = "if(error||data?.error){save.disabled=false;save.textContent='Generate';let detail=await edgeFunctionErrorMessage(error,data,'AI request failed');if(detail.includes('OPENAI_API_KEY'))detail='AI is not configured yet. Add OPENAI_API_KEY in Supabase → Edge Function Secrets.';return toast(detail,'error');}"
app = replace_once(app, ai_old, ai_new, 'AI detailed error')

insert_marker = "async function saveSettings(patch){"
helper = r'''async function edgeFunctionErrorMessage(error,data,fallback='Request failed'){
  if(data?.error)return String(data.error);
  try{if(error?.context?.clone){const payload=await error.context.clone().json();if(payload?.error)return String(payload.error);}}
  catch{}
  return error?.message||fallback;
}
async function saveMailAccountSettings(modal){
  const accounts=[...modal.querySelectorAll('.account-display-name')].map(input=>({address:input.dataset.accountAddress,display_name:input.value.trim()}));
  if(accounts.some(a=>!a.display_name)){toast('Each mail account needs a display name','warning');return false;}
  const {data,error}=await supabase.functions.invoke('mail-account-settings',{body:{accounts}});
  if(error||data?.error){toast(await edgeFunctionErrorMessage(error,data,'Could not update mail accounts'),'error');return false;}
  if(Array.isArray(data?.accounts))state.accounts=data.accounts;
  return true;
}
'''
if insert_marker not in app:
    raise SystemExit('Missing saveSettings marker')
app = app.replace(insert_marker, helper + insert_marker, 1)

old_note = "<small class=\"muted\">Inbound messages automatically receive an Info or Mail label based on the address that received them.</small>"
new_note = "<small class=\"muted\">Email addresses are read-only because they are tied to DNS and Resend. You can change the sender display name and choose the default sender here. Inbound messages automatically receive an Info or Mail label based on the original address that received them.</small>"
app = replace_once(app, old_note, new_note, 'mail account explanation')

css_add = r'''

/* Settings account editor */
.account-setting-row.editable{align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--line)}
.account-setting-row.editable:last-child{border-bottom:0}
.account-setting-main{flex:1;min-width:0}
.account-setting-main>strong{display:block}
.account-setting-main>small{display:block;color:var(--muted);margin-top:3px}
.account-edit-grid{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:12px;align-items:end;margin-top:10px}
.account-edit-grid label>span{display:block;font-size:10px;font-weight:700;color:var(--muted);margin-bottom:5px}
.account-display-name{width:100%;border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:9px 10px;outline:none}
.account-display-name:focus{border-color:var(--brand-2);box-shadow:var(--ff-focus)}
.account-default{display:flex!important;align-items:center;gap:7px;padding:9px 4px;white-space:nowrap}
.account-default span{display:inline!important;margin:0!important}
@media(max-width:620px){.account-edit-grid{grid-template-columns:1fr}.account-default{padding-left:0}}
'''
if '/* Settings account editor */' not in css:
    css += css_add

sw = replace_once(sw, "frankiflow-mail-dev-v5", "frankiflow-mail-dev-v6", 'service worker cache bump')

app_path.write_text(app)
css_path.write_text(css)
sw_path.write_text(sw)
