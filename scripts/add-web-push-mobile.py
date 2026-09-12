from pathlib import Path

app_path = Path('assets/app.js')
css_path = Path('assets/modern.css')
app = app_path.read_text()
css = css_path.read_text()


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing expected snippet: {label}')
    return text.replace(old, new, 1)

# Track whether this browser/device is subscribed to real background push.
app = replace_once(
    app,
    "  composer:null, commandOpen:false, filters:[], realtimeChannel:null\n};",
    "  composer:null, commandOpen:false, filters:[], realtimeChannel:null, pushConfigured:false, pushSubscriptionActive:false\n};",
    'state push flags',
)

# Make the top notification button generic instead of desktop-only wording.
app = app.replace('id="notifyBtn" title="Desktop notifications"', 'id="notifyBtn" title="Notifications"')

old_request = "async function requestNotifications(){if(typeof Notification==='undefined')return toast('Desktop notifications are not supported in this browser','warning');if(Notification.permission==='granted')return toast('Desktop notifications are already enabled','notifications_active');const result=await Notification.requestPermission();toast(result==='granted'?'Desktop notifications enabled':'Notifications were not enabled',result==='granted'?'notifications_active':'notifications_off');renderApp();}"
new_request = r'''function pushSupported(){return typeof Notification!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window;}
function pushDeviceName(){const ua=navigator.userAgent||'';if(/Android/i.test(ua))return /Chrome|CriOS/i.test(ua)?'Android · Chrome':'Android browser';if(/iPhone|iPad/i.test(ua))return'iPhone / iPad';if(/Windows/i.test(ua))return'Windows browser';if(/Macintosh|Mac OS X/i.test(ua))return'Mac browser';return navigator.userAgentData?.platform||'Browser device';}
function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64),output=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)output[i]=raw.charCodeAt(i);return output;}
async function mailServiceWorker(){let reg=await navigator.serviceWorker.getRegistration();if(!reg)reg=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;return reg;}
async function pushAction(action,payload={}){const {data,error}=await supabase.functions.invoke('mail-push',{body:{action,...payload}});if(error||data?.error)throw new Error(await edgeFunctionErrorMessage(error,data,'Push request failed'));return data||{};}
async function refreshPushStatus(){
  if(!pushSupported()){state.pushConfigured=false;state.pushSubscriptionActive=false;return{supported:false,configured:false,active:false};}
  try{const [config,reg]=await Promise.all([pushAction('config'),mailServiceWorker()]);const sub=await reg.pushManager.getSubscription();state.pushConfigured=Boolean(config.configured);state.pushSubscriptionActive=Boolean(sub);return{supported:true,configured:state.pushConfigured,active:state.pushSubscriptionActive,permission:Notification.permission,count:config.subscriptionCount||0};}
  catch(error){state.pushConfigured=false;state.pushSubscriptionActive=false;return{supported:true,configured:false,active:false,error:error?.message||String(error)};}
}
async function enablePushNotifications(){
  if(!pushSupported()){toast('Background push is not supported in this browser','warning');return false;}
  try{
    const config=await pushAction('config');if(!config.configured||!config.publicKey)throw new Error('Web Push server keys are not configured yet.');
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();if(permission!=='granted'){toast('Notification permission was not granted','notifications_off');return false;}
    const reg=await mailServiceWorker();let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(config.publicKey)});
    const subscription=sub.toJSON();await pushAction('subscribe',{subscription,userAgent:navigator.userAgent||'',deviceName:pushDeviceName()});
    state.pushConfigured=true;state.pushSubscriptionActive=true;toast('Background mail notifications enabled','notifications_active');return true;
  }catch(error){toast(error?.message||'Could not enable push notifications','error');return false;}
}
async function disablePushNotifications(){
  if(!pushSupported())return false;
  try{const reg=await mailServiceWorker(),sub=await reg.pushManager.getSubscription(),endpoint=sub?.endpoint||'';if(sub)await sub.unsubscribe();if(endpoint)await pushAction('unsubscribe',{endpoint});state.pushSubscriptionActive=false;toast('Background push disabled on this device','notifications_off');return true;}catch(error){toast(error?.message||'Could not disable push notifications','error');return false;}
}
async function testPushNotification(){try{const data=await pushAction('test');if(data.delivered>0)toast('Test push sent to your registered device','notifications_active');else toast('No test notification was delivered','warning');return data;}catch(error){toast(error?.message||'Could not send test push','error');return null;}}
async function refreshPushSettingsUI(modal){const status=await refreshPushStatus();if(!modal?.isConnected)return;const text=modal.querySelector('#pushStatusText'),enable=modal.querySelector('#enableNotificationsBtn'),test=modal.querySelector('#testPushBtn'),disable=modal.querySelector('#disablePushBtn');if(!status.supported){text.textContent='Not supported by this browser.';}else if(!status.configured){text.textContent='Server setup required: VAPID keys are not configured in Supabase yet.';}else if(status.active){text.textContent=`Enabled on this device (${pushDeviceName()}). Notifications can arrive while the app is closed.`;}else if(Notification.permission==='denied'){text.textContent='Blocked in browser/Android notification permissions.';}else{text.textContent='Ready. Enable it once on this device to receive mail in the background.';}if(enable)enable.disabled=!status.supported||!status.configured||status.active;if(test)test.disabled=!status.active||!status.configured;if(disable)disable.disabled=!status.active;}
function consumeMessageDeepLink(){const url=new URL(location.href),id=url.searchParams.get('message');if(!id)return;const message=state.messages.find(m=>m.id===id);if(message){state.folder=effectiveFolder(message)||'inbox';state.activeId=id;state.selected.clear();renderApp();}url.searchParams.delete('message');history.replaceState({},'',url.pathname+(url.searchParams.toString()?`?${url.searchParams}`:'')+url.hash);}
async function requestNotifications(){if(pushSupported())return enablePushNotifications();if(typeof Notification==='undefined')return toast('Notifications are not supported in this browser','warning');if(Notification.permission==='granted')return toast('Notifications are already enabled','notifications_active');const result=await Notification.requestPermission();toast(result==='granted'?'Browser notifications enabled':'Notifications were not enabled',result==='granted'?'notifications_active':'notifications_off');renderApp();}'''
app = replace_once(app, old_request, new_request, 'notification functions')

# Avoid duplicate OS notifications when a real Push subscription is active.
app = replace_once(
    app,
    "&&typeof Notification!=='undefined'&&Notification.permission==='granted'&&(document.hidden||!document.hasFocus()))",
    "&&!state.pushSubscriptionActive&&typeof Notification!=='undefined'&&Notification.permission==='granted'&&(document.hidden||!document.hasFocus()))",
    'foreground notification de-duplication',
)

# Add real mobile push controls to Settings > Notifications.
old_push_button = '<button class="btn" id="enableNotificationsBtn">${icon(\'notifications_active\')} Request browser permission</button></section>'
new_push_button = '''<div class="push-setting-card"><div class="push-setting-copy"><strong>${icon('phone_android')} Background app notifications</strong><small id="pushStatusText">Checking this device…</small></div><div class="settings-actions"><button class="btn" id="enableNotificationsBtn">${icon('notifications_active')} Enable on this device</button><button class="btn" id="testPushBtn">${icon('send_to_mobile')} Send test</button><button class="btn" id="disablePushBtn">${icon('notifications_off')} Disable device</button></div><small class="muted">Designed for the FrankiFlow Mail PWA installed from Chrome on Android. After enabling, new mail can notify you even when the app is closed.</small></div></section>'''
app = replace_once(app, old_push_button, new_push_button, 'settings push controls')

old_init = "modal.querySelector('#enableNotificationsBtn').onclick=requestNotifications;modal.querySelector('#manageSignaturesBtn').onclick=()=>openSignatureManager();"
new_init = "modal.querySelector('#enableNotificationsBtn').onclick=async()=>{await enablePushNotifications();await refreshPushSettingsUI(modal);};modal.querySelector('#testPushBtn').onclick=async()=>{await testPushNotification();await refreshPushSettingsUI(modal);};modal.querySelector('#disablePushBtn').onclick=async()=>{await disablePushNotifications();await refreshPushSettingsUI(modal);};refreshPushSettingsUI(modal);modal.querySelector('#manageSignaturesBtn').onclick=()=>openSignatureManager();"
app = replace_once(app, old_init, new_init, 'settings push handlers')

# Refresh push state after login and honor notification deep links.
old_auth_1 = "supabase.auth.onAuthStateChange(async(_event,session)=>{state.session=session;if(session){await loadAll();await setupRealtime();}else{await teardownRealtime();loginView();}});"
new_auth_1 = "supabase.auth.onAuthStateChange(async(_event,session)=>{state.session=session;if(session){await loadAll();await refreshPushStatus();consumeMessageDeepLink();await setupRealtime();}else{await teardownRealtime();loginView();}});"
app = replace_once(app, old_auth_1, new_auth_1, 'auth state push init')
old_auth_2 = "if(session){await loadAll();await setupRealtime();}else loginView();"
new_auth_2 = "if(session){await loadAll();await refreshPushStatus();consumeMessageDeepLink();await setupRealtime();}else loginView();"
app = replace_once(app, old_auth_2, new_auth_2, 'initial push init')

css_add = r'''

/* Android/PWA background Web Push */
.push-setting-card{margin-top:10px;padding:12px;border:1px solid color-mix(in srgb,var(--brand-2) 22%,var(--line));border-radius:13px;background:color-mix(in srgb,var(--brand-soft) 52%,var(--surface));display:grid;gap:10px}
.push-setting-copy{display:grid;gap:4px}.push-setting-copy strong{display:flex;align-items:center;gap:7px;font-size:12px}.push-setting-copy strong .material-symbols-rounded{font-size:19px;color:var(--brand-2)}.push-setting-copy small{color:var(--muted);line-height:1.45}.push-setting-card .settings-actions .btn:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:620px){.push-setting-card .settings-actions{display:grid;grid-template-columns:1fr}.push-setting-card .settings-actions .btn{justify-content:center;width:100%}}
'''
if '/* Android/PWA background Web Push */' not in css:
    css += css_add

app_path.write_text(app)
css_path.write_text(css)
