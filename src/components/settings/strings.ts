import { registerStrings } from '@/lib/i18n';

export const SETTINGS_STRINGS = {
  'settings.title': {
    de: 'Einstellungen',
    en: 'Settings',
  },
  'settings.subtitle': {
    de: 'Passe Darstellung, Lese- und Sendeoptionen, Signaturen, Vorlagen und dein Konto an.',
    en: 'Customize appearance, reading and sending options, signatures, templates, and your account.',
  },
  'settings.backToMail': {
    de: 'Zurück zum Postfach',
    en: 'Back to mailbox',
  },
  'settings.navLabel': {
    de: 'Einstellungsbereiche',
    en: 'Settings sections',
  },
  'settings.savedToast': {
    de: 'Einstellungen gespeichert.',
    en: 'Settings saved.',
  },
  'settings.unsavedBadge': {
    de: 'Ungespeicherte Änderungen',
    en: 'Unsaved changes',
  },
  'settings.leaveConfirmTitle': {
    de: 'Ungespeicherte Änderungen verwerfen?',
    en: 'Discard unsaved changes?',
  },
  'settings.leaveConfirmText': {
    de: 'Du hast Änderungen an Signaturen, Vorlagen oder dem Passwort noch nicht gespeichert.',
    en: 'You have unsaved changes in signatures, templates, or password fields.',
  },
  'settings.leaveDiscard': {
    de: 'Änderungen verwerfen',
    en: 'Discard changes',
  },
  'settings.stay': {
    de: 'Weiter bearbeiten',
    en: 'Keep editing',
  },
  'settings.loadError': {
    de: 'Einige Einstellungen konnten nicht geladen werden.',
    en: 'Some settings could not be loaded.',
  },

  // Sections
  'settings.section.appearance': {
    de: 'Erscheinungsbild',
    en: 'Appearance',
  },
  'settings.section.reading': {
    de: 'Lesen',
    en: 'Reading',
  },
  'settings.section.sending': {
    de: 'Senden',
    en: 'Sending',
  },
  'settings.section.signatures': {
    de: 'Signaturen',
    en: 'Signatures',
  },
  'settings.section.templates': {
    de: 'Vorlagen',
    en: 'Templates',
  },
  'settings.section.account': {
    de: 'Konto',
    en: 'Account',
  },
  'settings.section.shortcuts': {
    de: 'Tastenkürzel',
    en: 'Keyboard shortcuts',
  },

  // Appearance
  'settings.appearance.desc': {
    de: 'Änderungen am Erscheinungsbild werden sofort übernommen.',
    en: 'Appearance changes are applied immediately.',
  },
  'settings.appearance.theme': {
    de: 'Farbschema',
    en: 'Theme',
  },
  'settings.appearance.themeSystem': {
    de: 'Systemstandard',
    en: 'System default',
  },
  'settings.appearance.themeLight': {
    de: 'Hell',
    en: 'Light',
  },
  'settings.appearance.themeDark': {
    de: 'Dunkel',
    en: 'Dark',
  },
  'settings.appearance.density': {
    de: 'Anzeigedichte',
    en: 'Density',
  },
  'settings.appearance.densityComfortable': {
    de: 'Komfortabel',
    en: 'Comfortable',
  },
  'settings.appearance.densityCompact': {
    de: 'Kompakt',
    en: 'Compact',
  },
  'settings.appearance.readingPane': {
    de: 'Lesebereich',
    en: 'Reading pane',
  },
  'settings.appearance.readingPaneRight': {
    de: 'Rechts',
    en: 'Right',
  },
  'settings.appearance.readingPaneBottom': {
    de: 'Unten',
    en: 'Bottom',
  },
  'settings.appearance.readingPaneOff': {
    de: 'Aus (Vollansicht)',
    en: 'Off (full view)',
  },
  'settings.appearance.language': {
    de: 'Sprache',
    en: 'Language',
  },
  'settings.appearance.langDe': {
    de: 'Deutsch',
    en: 'German (Deutsch)',
  },
  'settings.appearance.langEn': {
    de: 'English',
    en: 'English',
  },

  // Reading
  'settings.reading.conversationView': {
    de: 'Konversationsansicht',
    en: 'Conversation view',
  },
  'settings.reading.conversationViewDesc': {
    de: 'Zusammengehörige Nachrichten als gemeinsamen Gesprächsverlauf gruppieren.',
    en: 'Group related messages together into threads.',
  },
  'settings.reading.remoteImages': {
    de: 'Externe Bilder in E-Mails',
    en: 'Remote images in emails',
  },
  'settings.reading.remoteImagesAsk': {
    de: 'Vor dem Laden fragen (schützt vor Tracking-Pixeln)',
    en: 'Ask before loading (protects against tracking pixels)',
  },
  'settings.reading.remoteImagesAlways': {
    de: 'Immer automatisch laden',
    en: 'Always load automatically',
  },

  // Sending
  'settings.sending.undoSend': {
    de: 'Senden rückgängig machen (Verzögerung)',
    en: 'Undo send delay',
  },
  'settings.sending.undoSendHint': {
    de: 'Zeitfenster nach dem Klicken auf „Senden“, in dem die E-Mail noch gestoppt werden kann.',
    en: 'Time window after clicking Send during which the message can still be cancelled.',
  },
  'settings.sending.undo0': {
    de: 'Aus (sofort senden)',
    en: '0 seconds (send immediately)',
  },
  'settings.sending.undo5': {
    de: '5 Sekunden',
    en: '5 seconds',
  },
  'settings.sending.undo10': {
    de: '10 Sekunden',
    en: '10 seconds',
  },

  // Rich Editor
  'settings.editor.bold': {
    de: 'Fett',
    en: 'Bold',
  },
  'settings.editor.italic': {
    de: 'Kursiv',
    en: 'Italic',
  },
  'settings.editor.link': {
    de: 'Link einfügen',
    en: 'Insert link',
  },
  'settings.editor.linkUrlLabel': {
    de: 'Link-Adresse (https:// oder mailto:)',
    en: 'Link URL (https:// or mailto:)',
  },
  'settings.editor.linkUrlPlaceholder': {
    de: 'https://frankiflow.de',
    en: 'https://frankiflow.de',
  },
  'settings.editor.linkInsert': {
    de: 'Einfügen',
    en: 'Insert',
  },
  'settings.editor.linkInvalid': {
    de: 'Bitte gib eine gültige http(s)://- oder mailto:-Adresse ein.',
    en: 'Please enter a valid http(s):// or mailto: address.',
  },

  // Signatures
  'settings.signatures.desc': {
    de: 'Richte für jedes Postfach eine eigene HTML-Signatur ein.',
    en: 'Configure a signature for each mailbox.',
  },
  'settings.signatures.mailboxLabel': {
    de: 'Postfach auswählen',
    en: 'Select mailbox',
  },
  'settings.signatures.editorLabel': {
    de: 'Signaturtext',
    en: 'Signature content',
  },
  'settings.signatures.defaultToggle': {
    de: 'Als Standard-Signatur für dieses Postfach aktivieren',
    en: 'Use as default signature for this mailbox',
  },
  'settings.signatures.defaultToggleDesc': {
    de: 'Wird beim Verfassen neuer Nachrichten automatisch eingefügt.',
    en: 'Automatically inserted when composing new messages.',
  },
  'settings.signatures.saveBtn': {
    de: 'Signatur speichern',
    en: 'Save signature',
  },
  'settings.signatures.savedToast': {
    de: 'Signatur gespeichert.',
    en: 'Signature saved.',
  },
  'settings.signatures.defaultGreeting': {
    de: 'Mit freundlichen Grüßen',
    en: 'Kind regards',
  },
  'settings.signatures.emptyTitle': {
    de: 'Keine Postfächer verfügbar',
    en: 'No mailboxes available',
  },
  'settings.signatures.emptyText': {
    de: 'Deinem Konto sind aktuell keine Postfächer zugewiesen.',
    en: 'No mailboxes are currently assigned to your account.',
  },

  // Templates
  'settings.templates.desc': {
    de: 'Wiederkehrende Antworten als Vorlagen speichern und im Composer mit einem Klick einfügen.',
    en: 'Save recurring replies as templates and insert them in the composer with one click.',
  },
  'settings.templates.newBtn': {
    de: 'Neue Vorlage',
    en: 'New template',
  },
  'settings.templates.emptyTitle': {
    de: 'Noch keine Vorlagen',
    en: 'No templates yet',
  },
  'settings.templates.emptyText': {
    de: 'Erstelle eine Vorlage für häufige Antworten wie Angebote oder Terminbestätigungen.',
    en: 'Create a template for frequent replies like quotes or appointment confirmations.',
  },
  'settings.templates.formCreateTitle': {
    de: 'Neue Vorlage erstellen',
    en: 'Create new template',
  },
  'settings.templates.formEditTitle': {
    de: 'Vorlage bearbeiten',
    en: 'Edit template',
  },
  'settings.templates.nameLabel': {
    de: 'Vorlagenname',
    en: 'Template name',
  },
  'settings.templates.namePlaceholder': {
    de: 'z. B. Erstangebot Büroreinigung',
    en: 'e.g. Initial office cleaning quote',
  },
  'settings.templates.subjectLabel': {
    de: 'Betreff',
    en: 'Subject',
  },
  'settings.templates.subjectPlaceholder': {
    de: 'z. B. Ihr unverbindliches Angebot von FrankiFlow',
    en: 'e.g. Your quote from FrankiFlow',
  },
  'settings.templates.bodyLabel': {
    de: 'Nachrichtentext',
    en: 'Template body',
  },
  'settings.templates.saveBtn': {
    de: 'Vorlage speichern',
    en: 'Save template',
  },
  'settings.templates.editBtn': {
    de: 'Bearbeiten',
    en: 'Edit',
  },
  'settings.templates.deleteBtn': {
    de: 'Löschen',
    en: 'Delete',
  },
  'settings.templates.validationError': {
    de: 'Bitte gib mindestens einen Namen für die Vorlage ein.',
    en: 'Please enter at least a name for the template.',
  },
  'settings.templates.savedToast': {
    de: 'Vorlage „{name}“ wurde gespeichert.',
    en: 'Template "{name}" saved.',
  },
  'settings.templates.deletedToast': {
    de: 'Vorlage wurde gelöscht.',
    en: 'Template deleted.',
  },
  'settings.templates.deleteConfirmTitle': {
    de: 'Vorlage löschen?',
    en: 'Delete template?',
  },
  'settings.templates.deleteConfirmText': {
    de: 'Möchtest du die Vorlage „{name}“ wirklich unwiderruflich löschen?',
    en: 'Are you sure you want to permanently delete the template "{name}"?',
  },

  // Account
  'settings.account.emailLabel': {
    de: 'Angemeldete E-Mail',
    en: 'Signed-in email',
  },
  'settings.account.modeLabel': {
    de: 'Modus',
    en: 'Mode',
  },
  'settings.account.modeDemo': {
    de: 'Demo-Modus',
    en: 'Demo mode',
  },
  'settings.account.modeLive': {
    de: 'Live (Supabase)',
    en: 'Live (Supabase)',
  },
  'settings.account.roleLabel': {
    de: 'Rolle',
    en: 'Role',
  },
  'settings.account.demoUsersLink': {
    de: 'Demo-Testbenutzer verwalten',
    en: 'Manage demo test users',
  },
  'settings.account.passwordHeading': {
    de: 'Passwort ändern',
    en: 'Change password',
  },
  'settings.account.newPassword': {
    de: 'Neues Passwort',
    en: 'New password',
  },
  'settings.account.repeatPassword': {
    de: 'Neues Passwort wiederholen',
    en: 'Repeat new password',
  },
  'settings.account.passwordMinHint': {
    de: 'Mindestens 8 Zeichen (im Live-Modus werden 12+ Zeichen empfohlen).',
    en: 'At least 8 characters (12+ characters recommended in live mode).',
  },
  'settings.account.strengthLabel': {
    de: 'Passwortstärke: {level}',
    en: 'Password strength: {level}',
  },
  'settings.account.strengthWeak': {
    de: 'Schwach (mind. 8 Zeichen erforderlich)',
    en: 'Weak (at least 8 characters required)',
  },
  'settings.account.strengthFair': {
    de: 'Ausreichend',
    en: 'Fair',
  },
  'settings.account.strengthGood': {
    de: 'Gut',
    en: 'Good',
  },
  'settings.account.strengthStrong': {
    de: 'Stark',
    en: 'Strong',
  },
  'settings.account.passwordTooShort': {
    de: 'Das Passwort muss mindestens 8 Zeichen lang sein.',
    en: 'Password must be at least 8 characters long.',
  },
  'settings.account.passwordTooShortLive': {
    de: 'Das Passwort muss im Live-Modus mindestens 12 Zeichen lang sein.',
    en: 'Password must be at least 12 characters long in live mode.',
  },
  'settings.account.passwordErrorGeneric': {
    de: 'Das Passwort konnte nicht geändert werden.',
    en: 'Password could not be updated.',
  },
  'settings.account.passwordMismatch': {
    de: 'Die beiden Passwörter stimmen nicht überein.',
    en: 'The passwords do not match.',
  },
  'settings.account.passwordSaveBtn': {
    de: 'Passwort aktualisieren',
    en: 'Update password',
  },
  'settings.account.passwordSavedToast': {
    de: 'Dein Passwort wurde erfolgreich geändert.',
    en: 'Your password has been updated.',
  },
  'settings.account.passwordError': {
    de: 'Das Passwort konnte nicht geändert werden. Im Live-Modus sind mindestens 12 Zeichen erforderlich.',
    en: 'Password could not be updated. Live mode requires at least 12 characters.',
  },
  'settings.account.signedOutToast': {
    de: 'Du wurdest abgemeldet.',
    en: 'You have been signed out.',
  },

  // Keyboard shortcuts
  'settings.shortcuts.desc': {
    de: 'Tastenkürzel sind im gesamten Postfach aktiv, solange kein Textfeld fokussiert ist.',
    en: 'Keyboard shortcuts work across the mailbox whenever focus is not inside a text field.',
  },
  'settings.shortcuts.nextPrev': {
    de: 'Nächste / vorherige Konversation in der Liste',
    en: 'Next / previous thread in list',
  },
  'settings.shortcuts.open': {
    de: 'Ausgewählte Konversation öffnen',
    en: 'Open selected thread',
  },
  'settings.shortcuts.back': {
    de: 'Zurück zur Konversationsliste',
    en: 'Back to thread list',
  },
  'settings.shortcuts.compose': {
    de: 'Neue E-Mail verfassen',
    en: 'Compose new message',
  },
  'settings.shortcuts.search': {
    de: 'Suchfeld fokussieren',
    en: 'Focus search field',
  },
  'settings.shortcuts.archive': {
    de: 'Archivieren',
    en: 'Archive thread',
  },
  'settings.shortcuts.delete': {
    de: 'In den Papierkorb verschieben',
    en: 'Move to trash',
  },
  'settings.shortcuts.star': {
    de: 'Stern setzen oder entfernen',
    en: 'Star or unstar',
  },
  'settings.shortcuts.reply': {
    de: 'Antworten',
    en: 'Reply',
  },
  'settings.shortcuts.replyAll': {
    de: 'Allen antworten',
    en: 'Reply all',
  },
  'settings.shortcuts.forward': {
    de: 'Weiterleiten',
    en: 'Forward',
  },
  'settings.shortcuts.help': {
    de: 'Tastenkürzel-Übersicht anzeigen',
    en: 'Show keyboard shortcuts help',
  },
  'settings.shortcuts.send': {
    de: 'Nachricht im Composer absenden',
    en: 'Send message in composer',
  },
} as const;

registerStrings(SETTINGS_STRINGS);
