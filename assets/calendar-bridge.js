const qs=(s,r=document)=>r.querySelector(s);
let scheduled=false;

function openCalendarManager(){
  const settings=qs('#settingsBtn');
  if(!settings)return;
  settings.click();
  const tryOpen=(attempt=0)=>{
    const calendar=qs('#calendarEventsBtn');
    if(calendar){
      const settingsBackdrop=calendar.closest('.modal-backdrop');
      calendar.click();
      setTimeout(()=>settingsBackdrop?.remove(),0);
      return;
    }
    if(attempt<20)setTimeout(()=>tryOpen(attempt+1),25);
  };
  tryOpen();
}

function bridgeButton(button){
  if(!button||button.dataset.ffCalendarBridge==='1')return button;
  const clone=button.cloneNode(true);
  clone.dataset.ffCalendarBridge='1';
  clone.title='Calendar & meetings';
  clone.setAttribute('aria-label','Calendar & meetings');
  button.replaceWith(clone);
  clone.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openCalendarManager();},true);
  return clone;
}

function decorate(){
  bridgeButton(qs('#ffMeetingBtn'));
  bridgeButton(qs('#ffReaderMeeting'));
}

function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;decorate();});
}

new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
schedule();
