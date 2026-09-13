from pathlib import Path

app_path = Path('assets/app.js')
sw_path = Path('sw.js')
app = app_path.read_text()
sw = sw_path.read_text()

# Add diagnostic state.
app = app.replace(
    "realtimeChannel:null, pushConfigured:false, pushSubscriptionActive:false",
    "realtimeChannel:null, pushConfigured:false, pushSubscriptionActive:false, pushLastError:null",
    1,
)

start = app.find("function pushSupported(){")
end = app.find("function notifyNewMail(m){", start)
if start < 0 or end < 0:
    raise SystemExit('Push function block not found')

new_block = r'''function pushSupported(){return typeof Notification!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window;}
function pushDeviceName(){const ua=navigator.userAgent||'';if(/Android/i.test(ua))return /Chrome|CriOS/i.test(ua)?'Android · Chrome':'Android browser';if(/iPhone|iPad/i.test(ua))return'iPhone / iPad';if(/Windows/i.test(ua))return'Windows browser';if(/Macintosh|Mac OS X/i.test(ua))return'Mac browser';return navigator.userAgentData?.platform||'Browser device';}
function urlBase64ToUint8Array(base64String){const clean=String(base64String||'').trim().replace(/=+$/,'');const padding='='.repeat((4-clean.length%4)%4),base64=(clean+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64),output=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)output[i]=raw.charCodeAt(i);return output;}
function uint8ToBase64Url(value){const bytes=value instanceof Uint8Array?value:new Uint8Array(value);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function subscriptionMatchesVapid(sub,publicKey){try{const current=sub?.options?.applicationServerKey;if(!current)return true;return uint8ToBase64Url(current)===String(publicKey||'').trim().replace(/=+$/,'');}catch{return false;}}
async function mailServiceWorker(){
  if(!('serviceWorker' in navigator))throw new Error('Service workers are not available in this browser.');
  let reg=await navigator.serviceWorker.getRegistration('/');
  if(!reg||!String(reg.active?.scriptURL||reg.installing?.scriptURL||reg.waiting?.scriptURL||'').includes('/sw.js'))reg=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
  try{await reg.update();}catch{}
  const ready=await navigator.serviceWorker.ready;
  if(!ready.active)throw new Error('FrankiFlow Mail service worker is not active yet. Close and reopen the installed app, then try again.');
  return ready;
}
async function pushAction(action,payload={}){
  const token=state.session?.access_token;
  if(!token)throw new Error('Your login session is not available. Sign in again and retry.');
  let response;
  try{
    response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/mail-push`,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
  }catch(error){throw new Error(`Could not reach the push service: ${error?.message||'network error'}`);}
  let data={};try{data=await response.json();}catch{}
  if(!response.ok||data?.error)throw new Error(data?.error||`Push service returned HTTP ${response.status}`);
  return data||{};
}
async function syncPushSubscription(sub){
  if(!sub)throw new Error('Chrome did not create a push subscription.');
  const subscription=sub.toJSON();
  if(!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth)throw new Error('Chrome returned an incomplete push subscription.');
  await pushAction('subscribe',{subscription,userAgent:navigator.userAgent||'',deviceName:pushDeviceName()});
  return true;
}
async function refreshPushStatus(){
  if(!pushSupported()){state.pushConfigured=false;state.pushSubscriptionActive=false;state.pushLastError='Push API is not supported by this browser.';return{supported:false,configured:false,active:false,error:state.pushLastError};}
  try{
    const config=await pushAction('config');
    state.pushConfigured=Boolean(config.configured);
    if(!state.pushConfigured){state.pushSubscriptionActive=false;state.pushLastError='VAPID server keys are not configured.';return{supported:true,configured:false,active:false,permission:Notification.permission,error:state.pushLastError};}
    const reg=await mailServiceWorker();let sub=await reg.pushManager.getSubscription();
    if(sub&&!subscriptionMatchesVapid(sub,config.publicKey)){await sub.unsubscribe();sub=null;}
    if(sub){await syncPushSubscription(sub);state.pushSubscriptionActive=true;state.pushLastError=null;}
    else{state.pushSubscriptionActive=false;state.pushLastError=null;}
    return{supported:true,configured:true,active:state.pushSubscriptionActive,permission:Notification.permission,count:config.subscriptionCount||0,worker:reg.active?.state||'unknown',localSubscription:Boolean(sub)};
  }catch(error){state.pushConfigured=true;state.pushSubscriptionActive=false;state.pushLastError=error?.message||String(error);return{supported:true,configured:true,active:false,permission:Notification.permission,error:state.pushLastError};}
}
async function enablePushNotifications(){
  if(!pushSupported()){toast('Background push is not supported in this browser','warning');return false;}
  state.pushLastError=null;
  try{
    const config=await pushAction('config');if(!config.configured||!config.publicKey)throw new Error('Web Push server keys are not configured yet.');
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(permission!=='granted')throw new Error(permission==='denied'?'Notifications are blocked for FrankiFlow Mail. Allow notifications in Android/Chrome App settings and try again.':'Notification permission was not granted.');
    const reg=await mailServiceWorker();let sub=await reg.pushManager.getSubscription();
    if(sub&&!subscriptionMatchesVapid(sub,config.publicKey)){await sub.unsubscribe();sub=null;}
    if(!sub){
      try{sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(config.publicKey)});}
      catch(error){throw new Error(`Chrome could not create the push subscription: ${error?.name||'Error'}${error?.message?` · ${error.message}`:''}`);}
    }
    await syncPushSubscription(sub);
    const verify=await pushAction('config');
    if(Number(verify.subscriptionCount||0)<1)throw new Error('The browser subscription was created but was not registered on the FrankiFlow server.');
    state.pushConfigured=true;state.pushSubscriptionActive=true;state.pushLastError=null;toast('Background mail notifications enabled','notifications_active');return true;
  }catch(error){state.pushSubscriptionActive=false;state.pushLastError=error?.message||'Could not enable push notifications';toast(state.pushLastError,'error');return false;}
}
async function disablePushNotifications(){
  if(!pushSupported())return false;
  try{const reg=await mailServiceWorker(),sub=await reg.pushManager.getSubscription(),endpoint=sub?.endpoint||'';if(sub)await sub.unsubscribe();if(endpoint)await pushAction('unsubscribe',{endpoint});state.pushSubscriptionActive=false;state.pushLastError=null;toast('Background push disabled on this device','notifications_off');return true;}catch(error){state.pushLastError=error?.message||'Could not disable push notifications';toast(state.pushLastError,'error');return false;}
}
async function testPushNotification(){try{const status=await refreshPushStatus();if(!status.active)throw new Error(status.error||'This device is not registered for background push yet.');const data=await pushAction('test');if(data.delivered>0)toast('Test push sent to your registered device','notifications_active');else throw new Error(`Push provider did not deliver the test (${data.failed||0} failed, ${data.gone||0} expired).`);return data;}catch(error){state.pushLastError=error?.message||'Could not send test push';toast(state.pushLastError,'error');return null;}}
async function refreshPushSettingsUI(modal){
  const status=await refreshPushStatus();if(!modal?.isConnected)return;
  const text=modal.querySelector('#pushStatusText'),enable=modal.querySelector('#enableNotificationsBtn'),test=modal.querySelector('#testPushBtn'),disable=modal.querySelector('#disablePushBtn');
  const details=[];details.push(`Permission: ${typeof Notification==='undefined'?'unsupported':Notification.permission}`);if(status.worker)details.push(`Worker: ${status.worker}`);details.push(`Device registration: ${status.active?'active':'not registered'}`);
  if(!status.supported)text.textContent='Not supported by this browser.';
  else if(!status.configured)text.textContent=`Server setup required. ${status.error||''}`.trim();
  else if(status.active)text.textContent=`Enabled on this device (${pushDeviceName()}). ${details.join(' · ')}`;
  else if(Notification.permission==='denied')text.textContent='Blocked by Android/Chrome notification permissions. Open the app notification settings, allow notifications, then tap Repair registration.';
  else if(status.error)text.textContent=`Push setup error: ${status.error} · ${details.join(' · ')}`;
  else text.textContent=`Ready but this device is not registered yet. ${details.join(' · ')}`;
  if(enable){enable.disabled=!status.supported||!status.configured;enable.innerHTML=`<span class="material-symbols-rounded">${status.active?'build_circle':'notifications_active'}</span>${status.active?'Repair registration':'Enable on this device'}`;}
  if(test)test.disabled=!status.active||!status.configured;if(disable)disable.disabled=!status.active;
}
function consumeMessageDeepLink(){const url=new URL(location.href),id=url.searchParams.get('message');if(!id)return;const message=state.messages.find(m=>m.id===id);if(message){state.folder=effectiveFolder(message)||'inbox';state.activeId=id;state.selected.clear();renderApp();}url.searchParams.delete('message');history.replaceState({},'',url.pathname+(url.searchParams.toString()?`?${url.searchParams}`:'')+url.hash);}
async function requestNotifications(){if(pushSupported())return enablePushNotifications();if(typeof Notification==='undefined')return toast('Notifications are not supported in this browser','warning');if(Notification.permission==='granted')return toast('Notifications are already enabled','notifications_active');const result=await Notification.requestPermission();toast(result==='granted'?'Browser notifications enabled':'Notifications were not enabled',result==='granted'?'notifications_active':'notifications_off');renderApp();}
'''

app = app[:start] + new_block + app[end:]

# Make the settings action explicit that it can repair a stale local Chrome subscription.
app = app.replace(
    "${icon('notifications_active')} Enable on this device</button><button class=\"btn\" id=\"testPushBtn\"",
    "${icon('notifications_active')} Enable on this device</button><button class=\"btn\" id=\"testPushBtn\"",
    1,
)

# Bump the service-worker cache so installed Android PWAs pick up the repair immediately.
sw = sw.replace("const CACHE = 'frankiflow-mail-dev-v9';", "const CACHE = 'frankiflow-mail-dev-v10';", 1)

app_path.write_text(app)
sw_path.write_text(sw)
