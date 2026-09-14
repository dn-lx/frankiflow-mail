import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import { CONFIG } from './config.js';

const supabase=createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let legacyMailLabelId=null;
let legacyMailLabelLoaded=false;

const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));

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

function removeObsoleteSettings(){
  const hiddenTitles=['sender identity status','mail users & personal mailboxes'];
  for(const section of document.querySelectorAll('.settings-section')){
    const title=(section.querySelector('h4')?.textContent||'').trim().toLowerCase();
    if(hiddenTitles.some(x=>title.includes(x)))section.remove();
  }
}

async function enhanceSettings(){
  const hub=document.querySelector('.settings-hub');
  if(!hub||hub.dataset.accountSecurityEnhanced==='true')return;
  hub.dataset.accountSecurityEnhanced='true';
  removeObsoleteSettings();

  const mailUser=await currentMailUser();
  if(!mailUser)return;

  const security=document.createElement('section');
  security.className='settings-section account-security-section';
  security.innerHTML=`
    <h4><span class="material-symbols-rounded">key</span> Password & sign-in</h4>
    <div class="account-login-note"><strong>${esc(mailUser.email)}</strong><small>Change your own FrankiFlow Mail password here.</small></div>
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
    const button=security.querySelector('[data-change-password]');
    button.disabled=true;
    const {error}=await supabase.auth.updateUser({password});
    button.disabled=false;
    if(error)return setStatus(security,error.message,'error');
    security.querySelector('[data-new-password]').value='';
    security.querySelector('[data-confirm-password]').value='';
    setStatus(security,'Password updated.');
  };
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

function cleanUi(){
  document.querySelector('[data-mobile-filter="mail"]')?.remove();
  hideLegacyMailLabel();
  removeObsoleteSettings();
  enhanceLogin();
  enhanceSettings();
}

const observer=new MutationObserver(cleanUi);
observer.observe(document.documentElement,{childList:true,subtree:true});
cleanUi();
