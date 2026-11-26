import { supabase } from './supabase-client.js';
const HIDDEN_SETTINGS=['compose & reply','notifications','mail accounts','sender identity status','mail users & personal mailboxes'];
let notificationHooked=false;

function hideUnwantedSettings(){
  for(const section of document.querySelectorAll('.settings-section')){
    const title=(section.querySelector('h4')?.textContent||'').trim().toLowerCase();
    if(HIDDEN_SETTINGS.some(name=>title.includes(name))){
      section.hidden=true;
      section.setAttribute('aria-hidden','true');
    }
  }
}

function attachPasswordEyes(){
  const pairs=[['[data-new-password]','New password'],['[data-confirm-password]','Confirm password']];
  for(const [selector,label] of pairs){
    const input=document.querySelector(selector);
    if(!input||input.dataset.eyeReady==='true')continue;
    input.dataset.eyeReady='true';
    const wrap=document.createElement('div');
    wrap.className='password-eye-wrap';
    input.parentNode.insertBefore(wrap,input);
    wrap.appendChild(input);
    const button=document.createElement('button');
    button.type='button';
    button.className='password-eye-btn';
    button.setAttribute('aria-label',`Show ${label.toLowerCase()}`);
    button.innerHTML='<span class="material-symbols-rounded">visibility</span>';
    button.onclick=()=>{
      const reveal=input.type==='password';
      input.type=reveal?'text':'password';
      button.innerHTML=`<span class="material-symbols-rounded">${reveal?'visibility_off':'visibility'}</span>`;
      button.setAttribute('aria-label',`${reveal?'Hide':'Show'} ${label.toLowerCase()}`);
    };
    wrap.appendChild(button);
  }
}

function autoEnableNotifications(){
  if(notificationHooked)return;
  notificationHooked=true;
  if(typeof Notification==='undefined'||Notification.permission==='denied')return;

  const trigger=()=>{
    const button=document.querySelector('#notifyBtn');
    if(!button)return false;
    if(Notification.permission==='granted'){
      button.click();
      return true;
    }
    if(Notification.permission==='default'){
      button.click();
      return true;
    }
    return false;
  };

  if(Notification.permission==='granted')setTimeout(trigger,300);
  else{
    const once=()=>{
      if(trigger())document.removeEventListener('pointerdown',once,true);
    };
    document.addEventListener('pointerdown',once,true);
  }
}

async function forceNotificationPreference(){
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    await supabase.from('frankiflow_mail_settings').update({notifications_enabled:true,updated_at:new Date().toISOString()}).eq('user_id',user.id);
  }catch{}
}

function cleanUi(){
  hideUnwantedSettings();
  attachPasswordEyes();
  autoEnableNotifications();
}

const observer=new MutationObserver(cleanUi);
observer.observe(document.documentElement,{subtree:true,childList:true});
cleanUi();
forceNotificationPreference();
