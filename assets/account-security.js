import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import { CONFIG } from './config.js';

const supabase=createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const ADMIN_URL=`${CONFIG.supabaseUrl}/functions/v1/mail-user-admin`;
let legacyMailLabelId=null;
let legacyMailLabelLoaded=false;

const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));

async function authHeaders(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)throw new Error('Please sign in again.');
  return {'Content-Type':'application/json','apikey':CONFIG.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`};
}

async function adminCall(action,payload={}){
  const response=await fetch(ADMIN_URL,{method:'POST',headers:await authHeaders(),body:JSON.stringify({action,...payload})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||`Request failed (${response.status})`);
  return data;
}

function setStatus(root,message,type='ok'){
  const el=root.querySelector('[data-account-security-status]');
  if(!el)return;
  el.textContent=message;
  el.style.color=type==='error'?'var(--danger)':'var(--muted)';
}

async function currentMailUser(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data}=await supabase.from('frankiflow_mail_users').select('user_id,email,role,active').eq('user_id',user.id).maybeSingle();
  return data||null;
}

async function hideLegacyMailLabel(){
  if(!legacyMailLabelLoaded){
    legacyMailLabelLoaded=true;
    try{
      const {data}=await supabase.from('frankiflow_mail_labels').select('id').eq('system_key','account_mail').maybeSingle();
      legacyMailLabelId=data?.id||null;
    }catch{}
  }
  if(legacyMailLabelId)document.querySelector(`[data-label="${CSS.escape(legacyMailLabelId)}"]`)?.remove();
}

async function renderTeamUsers(root){
  const list=root.querySelector('[data-mail-user-list]');
  if(!list)return;
  list.innerHTML='<small class="muted">Loading mail users…</small>';
  try{
    const data=await adminCall('list_users');
    list.innerHTML=(data.users||[]).map(u=>{
      const accounts=(u.accounts||[]).map(a=>`<span class="identity-tag">${esc(a.address)}${a.is_default?' · default':''}</span>`).join('');
      return `<div class="mail-user-card"><div><strong>${esc(u.email)}</strong><small>${esc(u.role)} · ${u.active?'active':'inactive'}</small></div><div class="mail-user-accounts">${accounts||'<span class="muted">No mailbox assigned</span>'}</div></div>`;
    }).join('')||'<small class="muted">No mail users configured.</small>';
  }catch(error){list.innerHTML=`<small style="color:var(--danger)">${esc(error.message)}</small>`;}
}

async function enhanceSettings(){
  const hub=document.querySelector('.settings-hub');
  if(!hub||hub.dataset.accountSecurityEnhanced==='true')return;
  hub.dataset.accountSecurityEnhanced='true';

  for(const section of hub.querySelectorAll('.settings-section')){
    const title=section.querySelector('h4')?.textContent?.trim().toLowerCase()||'';
    if(title.includes('sender identity status'))section.remove();
  }

  const mailUser=await currentMailUser();
  if(!mailUser)return;

  const security=document.createElement('section');
  security.className='settings-section account-security-section';
  security.innerHTML=`
    <h4><span class="material-symbols-rounded">key</span> Password & sign-in</h4>
    <div class="account-login-note"><strong>${esc(mailUser.email)}</strong><small>Your FrankiFlow Mail login is separate from the mailbox sender address. Change your own password here.</small></div>
    <div class="settings-grid two">
      <div class="field"><label>New password</label><input type="password" data-new-password minlength="12" autocomplete="new-password" placeholder="At least 12 characters"></div>
      <div class="field"><label>Confirm password</label><input type="password" data-confirm-password minlength="12" autocomplete="new-password" placeholder="Repeat password"></div>
    </div>
    <div class="settings-actions"><button class="btn" type="button" data-change-password><span class="material-symbols-rounded">password</span> Set password</button></div>
    <small class="muted" data-account-security-status></small>`;

  const org=[...hub.querySelectorAll('.settings-section')].find(s=>(s.querySelector('h4')?.textContent||'').includes('Organization'));
  org?hub.insertBefore(security,org):hub.append(security);

  security.querySelector('[data-change-password]').onclick=async()=>{
    const password=security.querySelector('[data-new-password]').value;
    const confirm=security.querySelector('[data-confirm-password]').value;
    if(password.length<12)return setStatus(security,'Use at least 12 characters.','error');
    if(password!==confirm)return setStatus(security,'The passwords do not match.','error');
    const button=security.querySelector('[data-change-password]');button.disabled=true;
    const {error}=await supabase.auth.updateUser({password});
    button.disabled=false;
    if(error)return setStatus(security,error.message,'error');
    security.querySelector('[data-new-password]').value='';security.querySelector('[data-confirm-password]').value='';
    setStatus(security,'Password updated.');
  };

  if(mailUser.role==='admin'){
    const team=document.createElement('section');
    team.className='settings-section mail-team-section';
    team.innerHTML=`
      <h4><span class="material-symbols-rounded">group</span> Mail users & personal mailboxes</h4>
      <p class="muted">Create a separate FrankiFlow Mail login and personal @frankiflow.de mailbox. Each new user also receives access to the shared <b>info@frankiflow.de</b> inbox.</p>
      <div class="settings-grid three">
        <div class="field"><label>Email address</label><input type="email" data-team-email placeholder="name@frankiflow.de"></div>
        <div class="field"><label>Display name</label><input type="text" data-team-name maxlength="80" placeholder="Full name"></div>
        <div class="field"><label>Temporary password</label><input type="password" data-team-password minlength="12" autocomplete="new-password" placeholder="At least 12 characters"></div>
      </div>
      <div class="settings-actions"><button class="btn" type="button" data-create-mail-user><span class="material-symbols-rounded">person_add</span> Create mail user</button></div>
      <small class="muted">Reserved system addresses such as info@, stay@, anfrage@ and mail@ cannot be created as personal users.</small>
      <div class="mail-user-list" data-mail-user-list></div>`;
    hub.insertBefore(team,security.nextSibling);
    team.querySelector('[data-create-mail-user]').onclick=async()=>{
      const email=team.querySelector('[data-team-email]').value.trim().toLowerCase();
      const display_name=team.querySelector('[data-team-name]').value.trim();
      const password=team.querySelector('[data-team-password]').value;
      if(!email||!display_name||password.length<12){setStatus(security,'Enter a FrankiFlow email, display name and a temporary password of at least 12 characters.','error');return;}
      const button=team.querySelector('[data-create-mail-user]');button.disabled=true;
      try{
        await adminCall('create_user',{email,display_name,password});
        team.querySelector('[data-team-email]').value='';team.querySelector('[data-team-name]').value='';team.querySelector('[data-team-password]').value='';
        setStatus(security,`Created ${email}. The user can sign in immediately and should set their own password.`);
        await renderTeamUsers(team);
      }catch(error){setStatus(security,error.message,'error');}
      finally{button.disabled=false;}
    };
    renderTeamUsers(team);
  }
}

function enhanceLogin(){
  const form=document.querySelector('#loginForm');
  if(!form||form.dataset.multiUserEnhanced==='true')return;
  form.dataset.multiUserEnhanced='true';
  const email=form.querySelector('#email');
  if(email){
    const remembered=localStorage.getItem('ffmail-last-login')||'';
    email.value=remembered;
    email.placeholder='your.name@frankiflow.de';
    form.addEventListener('submit',()=>localStorage.setItem('ffmail-last-login',email.value.trim().toLowerCase()),{capture:true});
  }
}

function removeLegacyMailUi(){
  document.querySelector('[data-mobile-filter="mail"]')?.remove();
  hideLegacyMailLabel();
  for(const section of document.querySelectorAll('.settings-section')){
    const title=section.querySelector('h4')?.textContent?.trim().toLowerCase()||'';
    if(title.includes('sender identity status'))section.remove();
  }
}

const observer=new MutationObserver(()=>{
  enhanceLogin();
  removeLegacyMailUi();
  enhanceSettings();
});
observer.observe(document.documentElement,{childList:true,subtree:true});
enhanceLogin();removeLegacyMailUi();enhanceSettings();
