import { registerStrings } from '@/lib/i18n';

export const AUTH_STRINGS = {
  'auth.login.title': {
    de: 'Bei FrankiFlow Mail anmelden',
    en: 'Sign in to FrankiFlow Mail',
  },
  'auth.login.subtitle': {
    de: 'Ruhiges, übersichtliches Postfach für dein Team.',
    en: 'Calm, focused mailbox for your team.',
  },
  'auth.login.subtitleDemo': {
    de: 'Du verwendest den Demo-Modus mit Beispieldaten im Browser.',
    en: 'You are using demo mode with sample data in your browser.',
  },
  'auth.login.email': {
    de: 'E-Mail-Adresse',
    en: 'Email address',
  },
  'auth.login.emailPlaceholder': {
    de: 'name@frankiflow.de',
    en: 'name@frankiflow.de',
  },
  'auth.login.password': {
    de: 'Passwort',
    en: 'Password',
  },
  'auth.login.showPassword': {
    de: 'Passwort anzeigen',
    en: 'Show password',
  },
  'auth.login.hidePassword': {
    de: 'Passwort verbergen',
    en: 'Hide password',
  },
  'auth.login.capsLock': {
    de: 'Feststelltaste ist aktiviert.',
    en: 'Caps Lock is on.',
  },
  'auth.login.submit': {
    de: 'Anmelden',
    en: 'Sign in',
  },
  'auth.login.forgotNote': {
    de: 'Passwort vergessen? Bitte wende dich an deinen Administrator.',
    en: 'Forgot your password? Please contact your administrator.',
  },
  'auth.login.divider': {
    de: 'oder',
    en: 'or',
  },
  'auth.login.tryDemo': {
    de: 'Demo ausprobieren',
    en: 'Try demo mode',
  },
  'auth.login.demoHint': {
    de: 'Demo: demo@frankiflow.de / demo1234',
    en: 'Demo: demo@frankiflow.de / demo1234',
  },
  'auth.login.fillDemo': {
    de: 'Ausfüllen',
    en: 'Fill in',
  },
  'auth.login.backToLive': {
    de: 'Zur Live-Anmeldung wechseln',
    en: 'Back to live sign-in',
  },
  'auth.login.manageDemoUsers': {
    de: 'Testbenutzer verwalten',
    en: 'Manage test users',
  },
  'auth.lang.label': {
    de: 'Sprache',
    en: 'Language',
  },
  'auth.lang.de': {
    de: 'DE',
    en: 'DE',
  },
  'auth.lang.en': {
    de: 'EN',
    en: 'EN',
  },
  'auth.error.invalid': {
    de: 'E-Mail-Adresse oder Passwort ist ungültig.',
    en: 'Invalid email address or password.',
  },
  'auth.error.notAuthorized': {
    de: 'Dieses Konto ist nicht für FrankiFlow Mail freigeschaltet. Bitte wende dich an den Administrator.',
    en: 'This account is not authorized for FrankiFlow Mail. Please contact your administrator.',
  },
  'auth.error.offline': {
    de: 'Keine Internetverbindung. Bitte prüfe deine Verbindung und versuche es erneut.',
    en: 'You are offline. Please check your connection and try again.',
  },
  'auth.error.required': {
    de: 'Bitte gib deine E-Mail-Adresse und dein Passwort ein.',
    en: 'Please enter your email address and password.',
  },
  'auth.error.generic': {
    de: 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.',
    en: 'Sign-in failed. Please try again.',
  },
  // Demo admin
  'demoAdmin.title': {
    de: 'Demo-Testbenutzer',
    en: 'Demo test users',
  },
  'demoAdmin.subtitle': {
    de: 'Erstelle eigene Testbenutzer mit ausgewählten Postfächern oder wechsle mit einem Klick das Konto.',
    en: 'Create your own test users with selected mailboxes or switch accounts with one click.',
  },
  'demoAdmin.liveOnlyTitle': {
    de: 'Nur im Demo-Modus verfügbar',
    en: 'Only available in demo mode',
  },
  'demoAdmin.liveOnlyText': {
    de: 'Die Testbenutzer-Verwaltung steht nur im Demo-Modus zur Verfügung.',
    en: 'Test user management is only available when running in demo mode.',
  },
  'demoAdmin.backToMail': {
    de: 'Zurück zum Postfach',
    en: 'Back to mailbox',
  },
  'demoAdmin.backToLogin': {
    de: 'Zurück zur Anmeldung',
    en: 'Back to sign-in',
  },
  'demoAdmin.switchToDemo': {
    de: 'Demo ausprobieren',
    en: 'Switch to demo mode',
  },
  'demoAdmin.signedInAs': {
    de: 'Aktuell angemeldet als {email}',
    en: 'Currently signed in as {email}',
  },
  'demoAdmin.usersHeading': {
    de: 'Vorhandene Demo-Benutzer',
    en: 'Existing demo users',
  },
  'demoAdmin.usersEmptyTitle': {
    de: 'Keine Demo-Benutzer gefunden',
    en: 'No demo users found',
  },
  'demoAdmin.usersEmptyText': {
    de: 'Setze die Demo-Daten zurück oder erstelle unten einen neuen Testbenutzer.',
    en: 'Reset demo data or create a new test user below.',
  },
  'demoAdmin.roleAdmin': {
    de: 'Administrator',
    en: 'Administrator',
  },
  'demoAdmin.roleMember': {
    de: 'Mitglied',
    en: 'Member',
  },
  'demoAdmin.activeBadge': {
    de: 'Aktiv',
    en: 'Active',
  },
  'demoAdmin.signInAs': {
    de: 'Anmelden als',
    en: 'Sign in as',
  },
  'demoAdmin.currentlySignedIn': {
    de: 'Aktuell angemeldet',
    en: 'Currently signed in',
  },
  'demoAdmin.createHeading': {
    de: 'Neuen Testbenutzer anlegen',
    en: 'Create new test user',
  },
  'demoAdmin.nameLabel': {
    de: 'Anzeigename',
    en: 'Display name',
  },
  'demoAdmin.namePlaceholder': {
    de: 'z. B. Anna Berger',
    en: 'e.g. Anna Berger',
  },
  'demoAdmin.emailLabel': {
    de: 'E-Mail-Adresse',
    en: 'Email address',
  },
  'demoAdmin.emailPlaceholder': {
    de: 'anna@frankiflow.de',
    en: 'anna@frankiflow.de',
  },
  'demoAdmin.passwordLabel': {
    de: 'Passwort (mind. 8 Zeichen)',
    en: 'Password (at least 8 characters)',
  },
  'demoAdmin.roleLabel': {
    de: 'Rolle',
    en: 'Role',
  },
  'demoAdmin.mailboxesLabel': {
    de: 'Postfächer zuweisen',
    en: 'Assign mailboxes',
  },
  'demoAdmin.newPersonalMailbox': {
    de: 'Neues persönliches Postfach erstellen',
    en: 'Create new personal mailbox',
  },
  'demoAdmin.newPersonalMailboxWithEmail': {
    de: 'Neues persönliches Postfach ({email})',
    en: 'New personal mailbox ({email})',
  },
  'demoAdmin.createSubmit': {
    de: 'Testbenutzer erstellen',
    en: 'Create test user',
  },
  'demoAdmin.createdToast': {
    de: 'Testbenutzer {email} wurde erstellt.',
    en: 'Test user {email} created.',
  },
  'demoAdmin.signedInToast': {
    de: 'Angemeldet als {email}.',
    en: 'Signed in as {email}.',
  },
  'demoAdmin.errorInvalidUser': {
    de: 'Bitte gib einen Namen, eine gültige E-Mail-Adresse, ein Passwort mit mindestens 8 Zeichen und mindestens ein Postfach an.',
    en: 'Please provide a name, a valid email address, a password of at least 8 characters, and at least one mailbox.',
  },
  'demoAdmin.errorUserExists': {
    de: 'Ein Demo-Benutzer mit dieser E-Mail-Adresse existiert bereits.',
    en: 'A demo user with this email address already exists.',
  },
  'demoAdmin.passwordDialogTitle': {
    de: 'Anmelden als {email}',
    en: 'Sign in as {email}',
  },
  'demoAdmin.passwordDialogDesc': {
    de: 'Bitte gib das Passwort für dieses Demo-Konto ein.',
    en: 'Please enter the password for this demo account.',
  },
  'demoAdmin.passwordDialogDemoHint': {
    de: 'Standard für demo@frankiflow.de: demo1234',
    en: 'Default for demo@frankiflow.de: demo1234',
  },
  'demoAdmin.resetHeading': {
    de: 'Demo-Daten zurücksetzen',
    en: 'Reset demo data',
  },
  'demoAdmin.resetDesc': {
    de: 'Setzt alle E-Mails, Entwürfe, Einstellungen und Testbenutzer auf den ursprünglichen Zustand zurück.',
    en: 'Resets all messages, drafts, settings, and test users back to the initial seed state.',
  },
  'demoAdmin.resetButton': {
    de: 'Demo-Daten zurücksetzen',
    en: 'Reset demo data',
  },
  'demoAdmin.resetConfirmTitle': {
    de: 'Demo-Daten wirklich zurücksetzen?',
    en: 'Reset all demo data?',
  },
  'demoAdmin.resetConfirmText': {
    de: 'Alle erstellten Testbenutzer, gesendeten Nachrichten und Änderungen im Demo-Modus werden gelöscht.',
    en: 'All created test users, sent messages, and changes in demo mode will be deleted.',
  },
  'demoAdmin.resetDoneToast': {
    de: 'Demo-Daten wurden auf den Ausgangszustand zurückgesetzt.',
    en: 'Demo data has been reset to defaults.',
  },
} as const;

registerStrings(AUTH_STRINGS);
