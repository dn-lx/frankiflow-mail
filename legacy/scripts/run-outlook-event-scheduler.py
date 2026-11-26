from pathlib import Path

patch=Path('scripts/apply-outlook-event-scheduler.py').read_text()
old="end=app.find('function defaultSignatureFor(address)',start)"
new="end=app.find('function showSendMenu(anchor)',start)"
if old not in patch:
    raise SystemExit('Expected event scheduler end marker was not found')
patch=patch.replace(old,new,1)
exec(compile(patch,'apply-outlook-event-scheduler.py','exec'),{'__name__':'__main__'})
