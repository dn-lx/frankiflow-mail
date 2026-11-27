import { registerStrings } from '@/lib/i18n';

registerStrings({
  'composer.region': { de: 'Nachrichtenentwürfe', en: 'Message drafts' },
  'composer.newMessage': { de: 'Neue Nachricht', en: 'New message' },
  'composer.minimize': { de: 'Minimieren', en: 'Minimise' },
  'composer.restore': { de: 'Wiederherstellen', en: 'Restore' },
  'composer.expand': { de: 'Vergrößern', en: 'Expand' },
  'composer.collapse': { de: 'Verkleinern', en: 'Collapse' },
  'composer.closeSave': { de: 'Schließen (Entwurf wird gespeichert)', en: 'Close (draft is saved)' },
  'composer.noMailbox': {
    de: 'Du hast kein Postfach, aus dem du senden darfst.',
    en: 'You have no mailbox you are allowed to send from.',
  },
  'composer.loadError': {
    de: 'Postfächer, Signaturen und Vorlagen konnten nicht geladen werden.',
    en: 'Mailboxes, signatures and templates could not be loaded.',
  },
  'composer.draftLoadError': { de: 'Der Entwurf konnte nicht geladen werden.', en: 'The draft could not be loaded.' },
  'composer.offline': {
    de: 'Offline: Senden ist erst wieder mit Verbindung möglich.',
    en: 'Offline: sending is possible again once you are connected.',
  },

  // Fields
  'composer.from': { de: 'Von', en: 'From' },
  'composer.to': { de: 'An', en: 'To' },
  'composer.subject': { de: 'Betreff', en: 'Subject' },
  'composer.body': { de: 'Nachrichtentext', en: 'Message text' },
  'composer.addCc': { de: 'Cc-Empfänger hinzufügen', en: 'Add Cc recipients' },
  'composer.addBcc': { de: 'Bcc-Empfänger hinzufügen', en: 'Add Bcc recipients' },

  // Recipients
  'composer.recipient.listLabel': { de: 'Empfänger in {field}', en: 'Recipients in {field}' },
  'composer.recipient.edit': { de: '{address} bearbeiten', en: 'Edit {address}' },
  'composer.recipient.editInvalid': {
    de: '{address} ist ungültig, zum Bearbeiten auswählen',
    en: '{address} is invalid, select to edit',
  },
  'composer.recipient.remove': { de: '{address} entfernen', en: 'Remove {address}' },
  'composer.recipient.removed': { de: '{address} entfernt', en: '{address} removed' },
  'composer.recipient.suggestions': { de: 'Kontaktvorschläge', en: 'Contact suggestions' },
  'composer.email.empty': { de: 'Die Adresse ist leer.', en: 'The address is empty.' },
  'composer.email.missing-at': {
    de: '„{address}“ ist keine gültige E-Mail-Adresse: das @ fehlt.',
    en: '“{address}” is not a valid email address: the @ is missing.',
  },
  'composer.email.missing-local': {
    de: '„{address}“ ist keine gültige E-Mail-Adresse: vor dem @ fehlt der Name.',
    en: '“{address}” is not a valid email address: the name before the @ is missing.',
  },
  'composer.email.missing-domain': {
    de: '„{address}“ ist keine gültige E-Mail-Adresse: die Domain (z. B. beispiel.de) fehlt.',
    en: '“{address}” is not a valid email address: the domain (e.g. example.com) is missing.',
  },
  'composer.email.spaces': {
    de: '„{address}“ ist keine gültige E-Mail-Adresse: sie enthält Leerzeichen.',
    en: '“{address}” is not a valid email address: it contains spaces.',
  },
  'composer.email.too-long': {
    de: '„{address}“ ist zu lang für eine E-Mail-Adresse.',
    en: '“{address}” is too long for an email address.',
  },
  'composer.email.invalid': {
    de: '„{address}“ ist keine gültige E-Mail-Adresse.',
    en: '“{address}” is not a valid email address.',
  },

  // Editor
  'composer.toolbar': { de: 'Formatierung', en: 'Formatting' },
  'composer.tool.bold': { de: 'Fett', en: 'Bold' },
  'composer.tool.italic': { de: 'Kursiv', en: 'Italic' },
  'composer.tool.underline': { de: 'Unterstrichen', en: 'Underline' },
  'composer.tool.bulleted': { de: 'Aufzählung', en: 'Bulleted list' },
  'composer.tool.numbered': { de: 'Nummerierte Liste', en: 'Numbered list' },
  'composer.tool.link': { de: 'Link einfügen oder bearbeiten', en: 'Insert or edit link' },
  'composer.tool.quote': { de: 'Zitat', en: 'Quote' },
  'composer.tool.clear': { de: 'Formatierung entfernen', en: 'Clear formatting' },
  'composer.link.title': { de: 'Link einfügen', en: 'Insert link' },
  'composer.link.editTitle': { de: 'Link bearbeiten', en: 'Edit link' },
  'composer.link.url': { de: 'Adresse (URL oder E-Mail)', en: 'Address (URL or email)' },
  'composer.link.text': { de: 'Angezeigter Text', en: 'Text to display' },
  'composer.link.apply': { de: 'Übernehmen', en: 'Apply' },
  'composer.link.remove': { de: 'Link entfernen', en: 'Remove link' },
  'composer.link.invalid': {
    de: 'Bitte eine Webadresse (https://…) oder E-Mail-Adresse eingeben.',
    en: 'Please enter a web address (https://…) or an email address.',
  },

  // Quote
  'composer.quote.wrote': { de: 'Am {date} schrieb {name}:', en: 'On {date}, {name} wrote:' },
  'composer.quote.forwarded': {
    de: '---------- Weitergeleitete Nachricht ----------',
    en: '---------- Forwarded message ----------',
  },
  'composer.quote.from': { de: 'Von', en: 'From' },
  'composer.quote.date': { de: 'Datum', en: 'Date' },
  'composer.quote.subject': { de: 'Betreff', en: 'Subject' },
  'composer.quote.to': { de: 'An', en: 'To' },
  'composer.quote.cc': { de: 'Cc', en: 'Cc' },

  // Attachments
  'composer.attach.add': { de: 'Dateien anhängen', en: 'Attach files' },
  'composer.attach.list': { de: 'Anhänge', en: 'Attachments' },
  'composer.attach.remove': { de: '{name} entfernen', en: 'Remove {name}' },
  'composer.attach.drop': { de: 'Dateien hier ablegen, um sie anzuhängen', en: 'Drop files here to attach them' },
  'composer.attach.fileTooBig': {
    de: '„{name}“ ist zu groß (höchstens {max} pro Datei).',
    en: '“{name}” is too large (at most {max} per file).',
  },
  'composer.attach.totalTooBig': {
    de: '„{name}“ wurde nicht angehängt: zusammen höchstens {max}.',
    en: '“{name}” was not attached: at most {max} in total.',
  },
  'composer.attach.tooMany': {
    de: '„{name}“ wurde nicht angehängt: höchstens {max} Dateien.',
    en: '“{name}” was not attached: at most {max} files.',
  },

  // Footer
  'composer.send': { de: 'Senden', en: 'Send' },
  'composer.sendHint': { de: 'Senden (Strg/⌘ + Enter)', en: 'Send (Ctrl/⌘ + Enter)' },
  'composer.schedule': { de: 'Später senden', en: 'Send later' },
  'composer.schedule.tomorrow': { de: 'Morgen, 08:00', en: 'Tomorrow, 08:00' },
  'composer.schedule.monday': { de: 'Montag, 08:00', en: 'Monday, 08:00' },
  'composer.schedule.custom': { de: 'Datum und Uhrzeit wählen …', en: 'Pick date and time …' },
  'composer.schedule.customTitle': { de: 'Senden planen', en: 'Schedule send' },
  'composer.schedule.when': { de: 'Senden am', en: 'Send on' },
  'composer.schedule.confirm': { de: 'Planen', en: 'Schedule' },
  'composer.schedule.invalid': { de: 'Bitte Datum und Uhrzeit angeben.', en: 'Please enter a date and time.' },
  'composer.schedule.tooSoon': {
    de: 'Der Zeitpunkt muss mindestens 2 Minuten in der Zukunft liegen.',
    en: 'The time must be at least 2 minutes in the future.',
  },
  'composer.templates': { de: 'Vorlage einfügen', en: 'Insert template' },
  'composer.templates.none': { de: 'Keine Vorlagen vorhanden', en: 'No templates yet' },
  'composer.discard': { de: 'Entwurf verwerfen', en: 'Discard draft' },
  'composer.discardTitle': { de: 'Entwurf verwerfen?', en: 'Discard draft?' },
  'composer.discardText': {
    de: 'Der Entwurf wird endgültig gelöscht.',
    en: 'The draft will be deleted permanently.',
  },
  'composer.discardConfirm': { de: 'Verwerfen', en: 'Discard' },
  'composer.discarded': { de: 'Entwurf verworfen', en: 'Draft discarded' },
  'composer.discardFailed': {
    de: 'Der Entwurf konnte nicht gelöscht werden.',
    en: 'The draft could not be deleted.',
  },
  'composer.unsavedTitle': { de: 'Entwurf nicht gespeichert', en: 'Draft not saved' },
  'composer.unsavedText': {
    de: 'Der Entwurf konnte nicht gespeichert werden. Wenn du jetzt schließt, gehen die letzten Änderungen verloren.',
    en: 'The draft could not be saved. If you close now, your latest changes are lost.',
  },
  'composer.closeWithoutSaving': { de: 'Ohne Speichern schließen', en: 'Close without saving' },
  'composer.draftSaved': { de: 'Entwurf gespeichert', en: 'Draft saved' },
  'composer.open': { de: 'Öffnen', en: 'Open' },

  // Save status
  'composer.status.saving': { de: 'Speichert…', en: 'Saving…' },
  'composer.status.saved': { de: 'Gespeichert', en: 'Saved' },
  'composer.status.error': { de: 'Nicht gespeichert – erneut versuchen', en: 'Not saved – try again' },

  // Validation and warnings
  'composer.validate.noRecipient': {
    de: 'Bitte mindestens einen Empfänger in „An“ eingeben.',
    en: 'Please enter at least one recipient in “To”.',
  },
  'composer.validate.invalid': {
    de: 'Bitte ungültige Adressen korrigieren: {list}',
    en: 'Please correct the invalid addresses: {list}',
  },
  'composer.validate.invalidGeneric': {
    de: 'Mindestens eine Empfängeradresse ist ungültig.',
    en: 'At least one recipient address is invalid.',
  },
  'composer.warnTitle': { de: 'Trotzdem senden?', en: 'Send anyway?' },
  'composer.warnBack': { de: 'Zurück zur Nachricht', en: 'Back to message' },
  'composer.warnSend': { de: 'Trotzdem senden', en: 'Send anyway' },
  'composer.warn.noSubject': { de: 'Die Nachricht hat keinen Betreff.', en: 'The message has no subject.' },
  'composer.warn.noAttachment': {
    de: 'Im Text wird ein Anhang erwähnt, aber es ist keine Datei angehängt.',
    en: 'The text mentions an attachment, but no file is attached.',
  },

  // Sending
  'composer.sending': { de: 'Wird gesendet…', en: 'Sending…' },
  'composer.sending.scheduled': { de: 'Wird geplant…', en: 'Scheduling…' },
  'composer.sent.ok': { de: 'Nachricht gesendet', en: 'Message sent' },
  'composer.sent.scheduled': { de: 'Geplant für {when}', en: 'Scheduled for {when}' },
  'composer.send.failed': {
    de: 'Die Nachricht wurde nicht gesendet. Bitte versuche es erneut.',
    en: 'The message was not sent. Please try again.',
  },
  'composer.send.offline': {
    de: 'Keine Internetverbindung. Die Nachricht wurde nicht gesendet.',
    en: 'No internet connection. The message was not sent.',
  },
  'composer.send.unconfirmed': {
    de: 'Die Nachricht wurde möglicherweise nicht zugestellt. Prüfe den Ordner „Gesendet“, bevor du sie erneut sendest.',
    en: 'The message may not have been delivered. Check Sent before sending it again.',
  },
  'composer.undoTooLate': { de: 'Die Nachricht wird bereits gesendet.', en: 'The message is already being sent.' },
  'composer.alreadySending': {
    de: 'Dieser Entwurf wird gerade gesendet.',
    en: 'This draft is being sent right now.',
  },
  'composer.tooMany': {
    de: 'Es können höchstens {max} Entwürfe gleichzeitig offen sein. Schließe zuerst einen.',
    en: 'At most {max} drafts can be open at once. Close one first.',
  },
});
