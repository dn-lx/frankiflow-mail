import type {
  AttachmentMeta,
  Contact,
  Label,
  Mailbox,
  Message,
  Priority,
  Signature,
  Template,
} from '../types.ts';
import {
  DEFAULT_SETTINGS,
  STATE_VERSION,
  hashPassword,
  type DemoState,
} from './store.ts';

function isoOffset(
  baseMs: number,
  days: number,
  hours = 0,
  minutes = 0
): string {
  const ms = baseMs + days * 86_400_000 + hours * 3_600_000 + minutes * 60_000;
  return new Date(ms).toISOString();
}

function tomorrowAtEightIso(baseMs: number): string {
  const d = new Date(baseMs + 86_400_000);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

function makePreview(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > 130 ? `${compact.slice(0, 127)}...` : compact;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function textToHtml(text: string): string {
  return text
    .split('\n\n')
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

interface SeedMsgInput {
  id: string;
  threadId: string;
  mailboxId: string;
  direction: Message['direction'];
  folder: Message['folder'];
  from: { address: string; name: string };
  to: string[];
  cc?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  isRead: boolean;
  isStarred?: boolean;
  isPinned?: boolean;
  priority?: Priority;
  attachments?: Omit<AttachmentMeta, 'messageId'>[];
  labelIds?: string[];
  timestamp: string;
  snoozedUntil?: string;
  scheduledAt?: string;
  inReplyTo?: string;
}

function makeMessage(input: SeedMsgInput): Message {
  const attachments: AttachmentMeta[] = (input.attachments ?? []).map((att) => ({
    ...att,
    messageId: input.id,
  }));
  return {
    id: input.id,
    threadId: input.threadId,
    mailboxId: input.mailboxId,
    direction: input.direction,
    folder: input.folder,
    from: input.from,
    to: input.to,
    cc: input.cc ?? [],
    bcc: [],
    subject: input.subject,
    textBody: input.textBody,
    htmlBody: input.htmlBody ?? textToHtml(input.textBody),
    preview: makePreview(input.textBody),
    isRead: input.isRead,
    isStarred: input.isStarred ?? false,
    isPinned: input.isPinned ?? false,
    priority: input.priority ?? 'normal',
    hasAttachments: attachments.length > 0,
    attachments,
    labelIds: input.labelIds ?? [],
    sentAt: input.direction === 'outbound' && input.folder === 'sent' ? input.timestamp : undefined,
    receivedAt: input.direction === 'inbound' ? input.timestamp : undefined,
    snoozedUntil: input.snoozedUntil,
    scheduledAt: input.scheduledAt,
    inReplyTo: input.inReplyTo,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
}

export async function createSeedState(nowMs: number = Date.now()): Promise<DemoState> {
  const demoUserId = 'user-demo-admin';
  const passwordHash = await hashPassword('demo1234');

  const mailboxes: Mailbox[] = [
    {
      id: 'mb-info',
      address: 'info@frankiflow.de',
      displayName: 'FrankiFlow',
      isPrimary: true,
      canSend: true,
    },
    {
      id: 'mb-team',
      address: 'team@frankiflow.de',
      displayName: 'FrankiFlow Team',
      isPrimary: false,
      canSend: true,
    },
  ];

  const labels: Label[] = [
    { id: 'lbl-angebote', name: 'Angebote', color: '#1F8A8A' },
    { id: 'lbl-termine', name: 'Termine', color: '#3B6FD8' },
    { id: 'lbl-rechnungen', name: 'Rechnungen', color: '#B7791F' },
    { id: 'lbl-privat', name: 'Privat', color: '#8E5BD0' },
  ];

  const signatures: Signature[] = [
    {
      id: 'sig-info',
      mailboxId: 'mb-info',
      html: '<p>Mit freundlichen Grüßen<br><strong>FrankiFlow Reinigung Frankfurt</strong><br>info@frankiflow.de · Musterstraße 14, 60311 Frankfurt</p>',
      isDefault: true,
    },
    {
      id: 'sig-team',
      mailboxId: 'mb-team',
      html: '<p>Viele Grüße<br><strong>Einsatzplanung FrankiFlow Team</strong><br>team@frankiflow.de</p>',
      isDefault: true,
    },
  ];

  const templates: Template[] = [
    {
      id: 'tpl-angebot',
      name: 'Angebot senden',
      subject: 'Ihr Reinigungsangebot von FrankiFlow',
      html: '<p>Guten Tag,</p><p>vielen Dank für Ihre Anfrage. Im Anhang senden wir Ihnen unser unverbindliches Angebot für die gewünschte Reinigung in Frankfurt.</p><p>Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>',
    },
    {
      id: 'tpl-termin',
      name: 'Terminbestätigung',
      subject: 'Terminbestätigung für Ihre Reinigung',
      html: '<p>Guten Tag,</p><p>gerne bestätigen wir Ihren Reinigungstermin am {{Datum}} um {{Uhrzeit}} Uhr. Unser Team bringt alle benötigten Reinigungsmittel mit.</p>',
    },
  ];

  const infoSender = { address: 'info@frankiflow.de', name: 'FrankiFlow' };
  const teamSender = { address: 'team@frankiflow.de', name: 'FrankiFlow Team' };

  const messages: Message[] = [
    // 1. Pinned + High Priority + Starred + Unread (Today)
    makeMessage({
      id: 'msg-01',
      threadId: 'th-01',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'katrin.weber@example.de', name: 'Katrin Weber' },
      to: ['info@frankiflow.de'],
      subject: 'Dringende Anfrage: Wohnungsreinigung in Sachsenhausen',
      textBody:
        'Guten Tag liebes FrankiFlow-Team,\n\nwir ziehen am kommenden Freitag in unsere 95 m² Wohnung in Frankfurt-Sachsenhausen ein und benötigen dringend eine gründliche Wohnungsreinigung inklusive Küche und zwei Bädern.\n\nHaben Sie am Mittwoch oder Donnerstag noch ein Zeitfenster frei? Über eine kurze Rückmeldung freue ich mich sehr.\n\nFreundliche Grüße\nKatrin Weber',
      isRead: false,
      isStarred: true,
      isPinned: true,
      priority: 'high',
      labelIds: ['lbl-angebote', 'lbl-termine'],
      timestamp: isoOffset(nowMs, 0, -1, -20),
    }),

    // 2. Büroreinigung + PDF attachment (Today)
    makeMessage({
      id: 'msg-02',
      threadId: 'th-02',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'm.hoffmann@nordstern-beratung.example.de', name: 'Markus Hoffmann' },
      to: ['info@frankiflow.de'],
      subject: 'Anfrage Büroreinigung Westend (320 m², 2x wöchentlich)',
      textBody:
        'Hallo zusammen,\n\nunser Beratungsbüro im Westend sucht einen zuverlässigen Partner für die Unterhaltsreinigung (ca. 320 m², zwei Mal pro Woche ab 18:00 Uhr). Im Anhang finden Sie unseren Grundriss als PDF.\n\nBitte senden Sie uns ein Angebot mit monatlicher Pauschale.\n\nBeste Grüße\nMarkus Hoffmann',
      isRead: false,
      labelIds: ['lbl-angebote'],
      attachments: [
        {
          id: 'att-02-1',
          filename: 'Grundriss-Buero-Westend.pdf',
          contentType: 'application/pdf',
          size: 4820,
        },
      ],
      timestamp: isoOffset(nowMs, 0, -2, -45),
    }),

    // 3. Treppenhausreinigung 2-message thread (Today)
    makeMessage({
      id: 'msg-03a',
      threadId: 'th-03',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'hausverwaltung@mainblick-hv.example.de', name: 'Sabine Krüger' },
      to: ['info@frankiflow.de'],
      subject: 'Treppenhausreinigung Bornheim – Starttermin nächste Woche',
      textBody:
        'Guten Morgen,\n\nwir möchten die wöchentliche Treppenhausreinigung für unser Objekt in der Berger Straße (4 Etagen) ab nächstem Dienstag beauftragen. Passt 08:30 Uhr für den ersten Einsatz?\n\nViele Grüße\nSabine Krüger',
      isRead: true,
      labelIds: ['lbl-termine'],
      timestamp: isoOffset(nowMs, 0, -5, 0),
    }),
    makeMessage({
      id: 'msg-03b',
      threadId: 'th-03',
      mailboxId: 'mb-info',
      direction: 'outbound',
      folder: 'sent',
      from: infoSender,
      to: ['hausverwaltung@mainblick-hv.example.de'],
      subject: 'Re: Treppenhausreinigung Bornheim – Starttermin nächste Woche',
      textBody:
        'Guten Tag Frau Krüger,\n\ndas passt hervorragend. Unser Team ist nächsten Dienstag um 08:30 Uhr vor Ort. Den Zugangscode haben wir bereits notiert.\n\nMit freundlichen Grüßen\nFrankiFlow',
      isRead: true,
      labelIds: ['lbl-termine'],
      inReplyTo: 'msg-03a',
      timestamp: isoOffset(nowMs, 0, -3, -15),
    }),

    // 4. Staircase SVG photo attachments (Today)
    makeMessage({
      id: 'msg-04',
      threadId: 'th-04',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'p.richter@ostend-wohnen.example.de', name: 'Peter Richter' },
      to: ['info@frankiflow.de'],
      subject: 'Fotos vom Treppenhaus Ostend für die Erstreinigung',
      textBody:
        'Hallo FrankiFlow-Team,\n\nwie telefonisch besprochen sende ich Ihnen zwei Aufnahmen vom Treppenhaus (Erdgeschoss und 2. OG), damit Sie den Aufwand für die Grundreinigung einschätzen können.\n\nViele Grüße\nPeter Richter',
      isRead: false,
      labelIds: ['lbl-angebote'],
      attachments: [
        {
          id: 'att-04-1',
          filename: 'treppenhaus-erdgeschoss.svg',
          contentType: 'image/svg+xml',
          size: 1420,
        },
        {
          id: 'att-04-2',
          filename: 'treppenhaus-2og.svg',
          contentType: 'image/svg+xml',
          size: 1480,
        },
      ],
      timestamp: isoOffset(nowMs, 0, -4, -10),
    }),

    // 5. Long 8-message back-and-forth thread (Yesterday -> Today)
    makeMessage({
      id: 'msg-05a',
      threadId: 'th-05',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'l.schmidt@taunus-finanz.example.com', name: 'Lukas Schmidt' },
      to: ['info@frankiflow.de'],
      subject: 'Großprojekt: Reinigung Büroetage Taunusanlage (1.200 m²)',
      textBody:
        'Guten Tag,\n\nwir beziehen im nächsten Monat eine neue Büroetage an der Taunusanlage (1.200 m², 24 Arbeitsplätze, 3 Konferenzräume, Teeküche) und suchen einen festen Reinigungspartner. Können wir einen Besichtigungstermin vereinbaren?\n\nBeste Grüße\nLukas Schmidt',
      isRead: true,
      labelIds: ['lbl-angebote'],
      timestamp: isoOffset(nowMs, -2, -6, 0),
    }),
    makeMessage({
      id: 'msg-05b',
      threadId: 'th-05',
      mailboxId: 'mb-info',
      direction: 'outbound',
      folder: 'sent',
      from: infoSender,
      to: ['l.schmidt@taunus-finanz.example.com'],
      subject: 'Re: Großprojekt: Reinigung Büroetage Taunusanlage (1.200 m²)',
      textBody:
        'Guten Tag Herr Schmidt,\n\nvielen Dank für Ihre Anfrage! Gerne kommen wir zur Besichtigung vorbei. Passt es Ihnen morgen um 10:00 Uhr oder 14:30 Uhr?\n\nMit freundlichen Grüßen\nFrankiFlow',
      isRead: true,
      inReplyTo: 'msg-05a',
      timestamp: isoOffset(nowMs, -2, -4, 0),
    }),
    makeMessage({
      id: 'msg-05c',
      threadId: 'th-05',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'l.schmidt@taunus-finanz.example.com', name: 'Lukas Schmidt' },
      to: ['info@frankiflow.de'],
      subject: 'Re: Großprojekt: Reinigung Büroetage Taunusanlage (1.200 m²)',
      textBody:
        '14:30 Uhr passt perfekt. Bitte melden Sie sich am Empfang im 6. OG.\n\nViele Grüße\nLukas Schmidt',
      isRead: true,
      inReplyTo: 'msg-05b',
      timestamp: isoOffset(nowMs, -2, -2, 0),
    }),
    makeMessage({
      id: 'msg-05d',
      threadId: 'th-05',
      mailboxId: 'mb-info',
      direction: 'outbound',
      folder: 'sent',
      from: infoSender,
      to: ['l.schmidt@taunus-finanz.example.com'],
      subject: 'Re: Großprojekt: Reinigung Büroetage Taunusanlage (1.200 m²)',
      textBody:
        'Vielen Dank für die angenehme Besichtigung heute! Im Anhang finden Sie unser detailliertes Angebot inklusive Glas- und Teeküchenservice.\n\nBeste Grüße\nFrankiFlow',
      isRead: true,
      labelIds: ['lbl-angebote'],
      attachments: [
        {
          id: 'att-05-1',
          filename: 'Angebot-Taunusanlage-1200qm.pdf',
          contentType: 'application/pdf',
          size: 6150,
        },
      ],
      inReplyTo: 'msg-05c',
      timestamp: isoOffset(nowMs, -1, -5, 0),
    }),
    makeMessage({
      id: 'msg-05e',
      threadId: 'th-05',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'l.schmidt@taunus-finanz.example.com', name: 'Lukas Schmidt' },
      to: ['info@frankiflow.de'],
      subject: 'Re: Großprojekt: Reinigung Büroetage Taunusanlage (1.200 m²)',
      textBody:
        'Danke für das schnelle Angebot! Eine Rückfrage zur Glasreinigung: Ist die Innenreinigung der gläsernen Konferenzraum-Trennwände einmal pro Woche enthalten?',
      isRead: true,
      inReplyTo: 'msg-05d',
      timestamp: isoOffset(nowMs, -1, -3, -30),
    }),
    makeMessage({
      id: 'msg-05f',
      threadId: 'th-05',
      mailboxId: 'mb-info',
      direction: 'outbound',
      folder: 'sent',
      from: infoSender,
      to: ['l.schmidt@taunus-finanz.example.com'],
      subject: 'Re: Großprojekt: Reinigung Büroetage Taunusanlage (1.200 m²)',
      textBody:
        'Ja, genau — die Glastrennwände der drei Konferenzräume wischen wir jeden Freitag komplett streifenfrei mit ab.\n\nViele Grüße\nFrankiFlow',
      isRead: true,
      inReplyTo: 'msg-05e',
      timestamp: isoOffset(nowMs, -1, -2, 0),
    }),
    makeMessage({
      id: 'msg-05g',
      threadId: 'th-05',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'l.schmidt@taunus-finanz.example.com', name: 'Lukas Schmidt' },
      to: ['info@frankiflow.de'],
      subject: 'Re: Großprojekt: Reinigung Büroetage Taunusanlage (1.200 m²)',
      textBody:
        'Perfekt, wir nehmen das Angebot so an! Können wir den Start auf den 1. des Monats legen? Bitte senden Sie uns noch die Terminbestätigung für die Schlüsselübergabe.',
      isRead: true,
      isStarred: true,
      labelIds: ['lbl-angebote', 'lbl-termine'],
      inReplyTo: 'msg-05f',
      timestamp: isoOffset(nowMs, 0, -6, 0),
    }),
    makeMessage({
      id: 'msg-05h',
      threadId: 'th-05',
      mailboxId: 'mb-info',
      direction: 'outbound',
      folder: 'sent',
      from: infoSender,
      to: ['l.schmidt@taunus-finanz.example.com'],
      subject: 'Re: Großprojekt: Reinigung Büroetage Taunusanlage (1.200 m²)',
      textBody:
        'Wunderbar, herzlichen Dank für Ihr Vertrauen! Wir bestätigen den Start zum 1. des Monats und kommen zur Schlüsselübergabe am Vortag um 11:00 Uhr vorbei.\n\nMit freundlichen Grüßen\nFrankiFlow',
      isRead: true,
      labelIds: ['lbl-termine'],
      inReplyTo: 'msg-05g',
      timestamp: isoOffset(nowMs, 0, -1, -5),
    }),

    // 6. English Airbnb turnover (Today, team mailbox)
    makeMessage({
      id: 'msg-06',
      threadId: 'th-06',
      mailboxId: 'mb-team',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'claire.bennett@example.org', name: 'Claire Bennett' },
      to: ['team@frankiflow.de'],
      subject: 'Airbnb turnover cleaning in Nordend – Saturday 11:00',
      textBody:
        'Hi FrankiFlow team,\n\nOur guests check out at 11:00 AM this Saturday at our 2-bedroom apartment in Nordend, and the next guests arrive at 15:00. Could you handle the full turnover including fresh linen change?\n\nThanks so much,\nClaire',
      isRead: false,
      labelIds: ['lbl-termine'],
      timestamp: isoOffset(nowMs, 0, -2, -10),
    }),

    // 7. Payment reminder + PDF invoice (Yesterday)
    makeMessage({
      id: 'msg-07',
      threadId: 'th-07',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'buchhaltung@glanzwerk-bedarf.example.de', name: 'Buchhaltung GlanzWerk' },
      to: ['info@frankiflow.de'],
      subject: 'Zahlungserinnerung zu Rechnung RE-2026-1142',
      textBody:
        'Sehr geehrte Damen und Herren,\n\nfür Ihre Lieferung von Glasreiniger-Konzentrat und Wischbezügen liegt uns noch kein Zahlungseingang zu Rechnung RE-2026-1142 (428,40 €) vor. Im Anhang finden Sie die Rechnungskopie.\n\nFreundliche Grüße\nGlanzWerk Bedarf GmbH',
      isRead: false,
      labelIds: ['lbl-rechnungen'],
      attachments: [
        {
          id: 'att-07-1',
          filename: 'Rechnung-RE-2026-1142.pdf',
          contentType: 'application/pdf',
          size: 5120,
        },
      ],
      timestamp: isoOffset(nowMs, -1, -2, 0),
    }),

    // 8. Reschedule Fensterreinigung (Yesterday, team)
    makeMessage({
      id: 'msg-08',
      threadId: 'th-08',
      mailboxId: 'mb-team',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 't.becker@bockenheim-atelier.example.de', name: 'Tobias Becker' },
      to: ['team@frankiflow.de'],
      subject: 'Terminverschiebung Fensterreinigung Bockenheim',
      textBody:
        'Hallo Team,\n\nkönnen wir die geplante Fensterreinigung am Donnerstag von 09:00 Uhr auf 13:00 Uhr verschieben? Vormittags haben wir noch einen Handwerker im Studio.\n\nDanke vorab!\nTobias Becker',
      isRead: true,
      labelIds: ['lbl-termine'],
      timestamp: isoOffset(nowMs, -1, -4, 0),
    }),

    // 9. Grundreinigung nach Auszug (Yesterday)
    makeMessage({
      id: 'msg-09',
      threadId: 'th-09',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'nina.keller@example.de', name: 'Nina Keller' },
      to: ['info@frankiflow.de'],
      subject: 'Anfrage Grundreinigung nach Auszug (78 m²)',
      textBody:
        'Guten Tag,\n\nam Ende des Monats übergebe ich meine 78 m² Wohnung in Bornheim an den Vermieter. Was kostet eine komplette Grundreinigung inklusive Backofen, Kühlschrank und Rollläden?\n\nViele Grüße\nNina Keller',
      isRead: true,
      labelIds: ['lbl-angebote'],
      timestamp: isoOffset(nowMs, -1, -6, 0),
    }),

    // 10. HTML Newsletter 1 (remote image + 1x1 tracking pixel)
    makeMessage({
      id: 'msg-10',
      threadId: 'th-10',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'newsletter@cleanpro-bedarf.example.com', name: 'CleanPro Bedarf' },
      to: ['info@frankiflow.de'],
      subject: 'Herbst-Aktion: Öko-Reinigungskonzentrate & Mikrofaser-Sets',
      textBody:
        'CleanPro Bedarf Herbst-Aktion: 15% Rabatt auf Öko-Reinigungskonzentrate und Mikrofasertücher für Gebäudereiniger in Frankfurt.',
      htmlBody:
        '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;"><img src="https://images.example.com/cleanpro-hero.jpg" alt="CleanPro Herbst-Aktion" style="width:100%;height:auto;border-radius:6px;margin-bottom:16px;" /><h2 style="color:#1F8A8A;margin:0 0 12px;">15% Rabatt auf Öko-Konzentrate</h2><p style="color:#334155;line-height:1.5;">Entdecken Sie unsere neuen biologisch abbaubaren Reiniger für Büro- und Treppenhausreinigung.</p><a href="https://cleanpro-bedarf.example.com/aktion" style="display:inline-block;padding:10px 18px;background:#1F8A8A;color:#ffffff;text-decoration:none;border-radius:6px;">Jetzt ansehen</a><img src="https://track.example.com/pixel-1.gif" width="1" height="1" alt="" style="display:block;border:0;" /></div>',
      isRead: false,
      timestamp: isoOffset(nowMs, -1, -8, 0),
    }),

    // 11. HTML Newsletter 2 (remote image + 1x1 tracking pixel)
    makeMessage({
      id: 'msg-11',
      threadId: 'th-11',
      mailboxId: 'mb-team',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'redaktion@gewerbe-frankfurt.example.org', name: 'Frankfurter Gewerbe-Brief' },
      to: ['team@frankiflow.de'],
      subject: 'Newsletter: Neue Arbeitsschutz-Hinweise für Dienstleister',
      textBody:
        'Frankfurter Gewerbe-Brief: Aktuelle Hinweise zu Ergonomie, Hautschutz und nachhaltiger Reinigung in Rhein-Main.',
      htmlBody:
        '<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #cbd5e1;"><img src="https://images.example.com/gewerbe-banner.jpg" alt="Frankfurter Gewerbe-Brief" style="width:100%;height:auto;margin-bottom:14px;" /><h2 style="color:#0f172a;font-size:20px;">Nachhaltige Gebäudereinigung im Rhein-Main-Gebiet</h2><p style="color:#475569;font-size:15px;">Lesen Sie unsere kompakte Übersicht zu neuen Dosiersystemen und Hautschutzplänen für mobile Reinigungsteams.</p><img src="https://track.example.com/pixel-2.gif" width="1" height="1" alt="" /></div>',
      isRead: true,
      timestamp: isoOffset(nowMs, -2, -3, 0),
    }),

    // 12. Job application with CV PDF
    makeMessage({
      id: 'msg-12',
      threadId: 'th-12',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'elena.popescu@example.de', name: 'Elena Popescu' },
      to: ['info@frankiflow.de'],
      subject: 'Bewerbung als Reinigungskraft (Vollzeit / Teilzeit)',
      textBody:
        'Sehr geehrtes FrankiFlow-Team,\n\nich bewerbe mich hiermit als Reinigungskraft für Frankfurt und Umgebung. Ich habe fünf Jahre Erfahrung in der Büro- und Treppenhausreinigung und besitze einen Führerschein Klasse B.\n\nMeinen Lebenslauf finden Sie im Anhang.\n\nMit freundlichen Grüßen\nElena Popescu',
      isRead: false,
      attachments: [
        {
          id: 'att-12-1',
          filename: 'Lebenslauf-Elena-Popescu.pdf',
          contentType: 'application/pdf',
          size: 7340,
        },
      ],
      timestamp: isoOffset(nowMs, -2, -5, 0),
    }),

    // 13. Team Schlüsselübergabe (2 messages)
    makeMessage({
      id: 'msg-13a',
      threadId: 'th-13',
      mailboxId: 'mb-team',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'jan.meyer@example.de', name: 'Jan Meyer' },
      to: ['team@frankiflow.de'],
      subject: 'Schlüsselübergabe Objekt Europaviertel',
      textBody:
        'Hallo zusammen,\n\nhabe den Transponder für das Objekt Europa-Allee 88 heute abgeholt. Soll ich ihn heute Abend im Büro vorbeibringen?',
      isRead: true,
      labelIds: ['lbl-termine'],
      timestamp: isoOffset(nowMs, -2, -9, 0),
    }),
    makeMessage({
      id: 'msg-13b',
      threadId: 'th-13',
      mailboxId: 'mb-team',
      direction: 'outbound',
      folder: 'sent',
      from: teamSender,
      to: ['jan.meyer@example.de'],
      subject: 'Re: Schlüsselübergabe Objekt Europaviertel',
      textBody:
        'Hi Jan, super! Ja, leg ihn einfach in das Schlüsselfach B im Büro. Danke dir!',
      isRead: true,
      inReplyTo: 'msg-13a',
      timestamp: isoOffset(nowMs, -2, -7, 0),
    }),

    // 14. Supplier order
    makeMessage({
      id: 'msg-14',
      threadId: 'th-14',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'bestellung@cleanpro-bedarf.example.com', name: 'CleanPro Bestellservice' },
      to: ['info@frankiflow.de'],
      subject: 'Bestellbestätigung #CP-88412 – Reinigungsmittel & Tücher',
      textBody:
        'Vielen Dank für Ihre Bestellung #CP-88412:\n- 6x Neutralreiniger 10L\n- 40x Mikrofasertuch Blau\n- 10x Glaswischer-Ersatzgummi\n\nVoraussichtliche Lieferung: Übermorgen zwischen 09:00 und 12:00 Uhr.',
      isRead: true,
      labelIds: ['lbl-rechnungen'],
      timestamp: isoOffset(nowMs, -3, -2, 0),
    }),

    // 15. English quote request
    makeMessage({
      id: 'msg-15',
      threadId: 'th-15',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'david.miller@apex-design.example.com', name: 'David Miller' },
      to: ['info@frankiflow.de'],
      subject: 'Quote request: Monthly office cleaning at Mainzer Landstraße',
      textBody:
        'Hello,\n\nWe run a 180 sqm design studio on Mainzer Landstraße and would like a quote for weekly evening cleaning plus monthly window cleaning.\n\nBest regards,\nDavid Miller',
      isRead: true,
      labelIds: ['lbl-angebote'],
      timestamp: isoOffset(nowMs, -3, -5, 0),
    }),

    // 16. Angebot Fensterreinigung Wintergarten (2 messages)
    makeMessage({
      id: 'msg-16a',
      threadId: 'th-16',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'h.krause@example.de', name: 'Hanna Krause' },
      to: ['info@frankiflow.de'],
      subject: 'Fensterreinigung Wintergarten in Riedberg',
      textBody:
        'Guten Tag,\n\nunser Wintergarten hat 18 Glasflächen inkl. Glasdach. Können Sie uns ein Festpreis-Angebot machen?\n\nViele Grüße\nHanna Krause',
      isRead: true,
      labelIds: ['lbl-angebote'],
      timestamp: isoOffset(nowMs, -4, -4, 0),
    }),
    makeMessage({
      id: 'msg-16b',
      threadId: 'th-16',
      mailboxId: 'mb-info',
      direction: 'outbound',
      folder: 'sent',
      from: infoSender,
      to: ['h.krause@example.de'],
      subject: 'Re: Fensterreinigung Wintergarten in Riedberg',
      textBody:
        'Guten Tag Frau Krause,\n\nfür die komplette Reinigung Ihres Wintergartens inkl. Glasdach und Rahmen bieten wir Ihnen einen Festpreis von 195 € brutto an.\n\nMit freundlichen Grüßen\nFrankiFlow',
      isRead: true,
      inReplyTo: 'msg-16a',
      timestamp: isoOffset(nowMs, -4, -1, 0),
    }),

    // 17. Team internal question
    makeMessage({
      id: 'msg-17',
      threadId: 'th-17',
      mailboxId: 'mb-team',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'sofia.lange@example.de', name: 'Sofia Lange' },
      to: ['team@frankiflow.de'],
      subject: 'Nachschub Entkalker & Einweghandschuhe Größe M',
      textBody:
        'Hallo, im Fahrzeug 2 ist der Sanitär-Entkalker fast leer und wir brauchen noch zwei Packungen Handschuhe in Größe M. Können wir das für Montag bereitlegen?',
      isRead: false,
      timestamp: isoOffset(nowMs, -4, -6, 0),
    }),

    // 18. Starred Terminbestätigung Praxisreinigung
    makeMessage({
      id: 'msg-18',
      threadId: 'th-18',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'praxis@zahnmedizin-gallus.example.de', name: 'Dr. Miriam Roth' },
      to: ['info@frankiflow.de'],
      subject: 'Terminbestätigung Praxisreinigung Gallus',
      textBody:
        'Guten Tag,\n\nwir bestätigen die tägliche Abendreinigung unserer Zahnarztpraxis ab dem 15. des Monats jeweils ab 19:30 Uhr.\n\nVielen Dank und herzliche Grüße\nDr. Miriam Roth',
      isRead: true,
      isStarred: true,
      labelIds: ['lbl-termine'],
      timestamp: isoOffset(nowMs, -5, -3, 0),
    }),

    // 19. English Airbnb weekend
    makeMessage({
      id: 'msg-19',
      threadId: 'th-19',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'marco.rossi@example.com', name: 'Marco Rossi' },
      to: ['info@frankiflow.de'],
      subject: 'Airbnb check-out clean near Hauptbahnhof',
      textBody:
        'Hi there, we have two studio apartments near Hauptbahnhof that need reliable turnover cleaning every Sunday morning. Are you available?',
      isRead: true,
      timestamp: isoOffset(nowMs, -6, -4, 0),
    }),

    // 20. Team Privat label
    makeMessage({
      id: 'msg-20',
      threadId: 'th-20',
      mailboxId: 'mb-team',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'jan.meyer@example.de', name: 'Jan Meyer' },
      to: ['team@frankiflow.de'],
      subject: 'Terminvorschläge Team-Abendessen in Sachsenhausen',
      textBody:
        'Hey alle zusammen, sollen wir für unser Team-Abendessen den nächsten Donnerstag oder den Freitag übernächste Woche nehmen?',
      isRead: true,
      labelIds: ['lbl-privat'],
      timestamp: isoOffset(nowMs, -7, -2, 0),
    }),

    // 21. Treppenhaus 14-tägig (2 messages)
    makeMessage({
      id: 'msg-21a',
      threadId: 'th-21',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'weg@hoechst-altstadt.example.de', name: 'WEG Altstadt Höchst' },
      to: ['info@frankiflow.de'],
      subject: 'Treppenhausreinigung 14-tägig in Höchst',
      textBody:
        'Guten Tag, unsere Eigentümergemeinschaft sucht für ein 3-Parteien-Haus eine 14-tägige Treppenhausreinigung inklusive Briefkastenanlage.',
      isRead: true,
      labelIds: ['lbl-angebote'],
      timestamp: isoOffset(nowMs, -8, -5, 0),
    }),
    makeMessage({
      id: 'msg-21b',
      threadId: 'th-21',
      mailboxId: 'mb-info',
      direction: 'outbound',
      folder: 'sent',
      from: infoSender,
      to: ['weg@hoechst-altstadt.example.de'],
      subject: 'Re: Treppenhausreinigung 14-tägig in Höchst',
      textBody:
        'Guten Tag,\n\nvielen Dank für Ihre Anfrage. Gerne übernehmen wir Ihr Objekt im 14-Tage-Rhythmus für 89 € netto pro Monat.\n\nMit freundlichen Grüßen\nFrankiFlow',
      isRead: true,
      inReplyTo: 'msg-21a',
      timestamp: isoOffset(nowMs, -8, -2, 0),
    }),

    // 22. Incoming invoice PDF
    makeMessage({
      id: 'msg-22',
      threadId: 'th-22',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'service@fuhrpark-rheinmain.example.de', name: 'Fuhrpark RheinMain' },
      to: ['info@frankiflow.de'],
      subject: 'Rechnung Inspektion Transporter F-FF 204',
      textBody:
        'Guten Tag,\n\nanbei erhalten Sie die Rechnung für die Jahresinspektion Ihres Transporters F-FF 204.',
      isRead: true,
      labelIds: ['lbl-rechnungen'],
      attachments: [
        {
          id: 'att-22-1',
          filename: 'Rechnung-Inspektion-F-FF-204.pdf',
          contentType: 'application/pdf',
          size: 4390,
        },
      ],
      timestamp: isoOffset(nowMs, -9, -4, 0),
    }),

    // 23. Grundreinigung Fliesen
    makeMessage({
      id: 'msg-23',
      threadId: 'th-23',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'info@cafe-mainufer.example.de', name: 'Café Mainufer' },
      to: ['info@frankiflow.de'],
      subject: 'Grundreinigung Fliesen & Fugen im Gastraum',
      textBody:
        'Hallo FrankiFlow, wir schließen am kommenden Montag für einen Ruhetag und möchten gerne eine maschinelle Grundreinigung unserer Fliesen im Gastraum buchen.',
      isRead: true,
      timestamp: isoOffset(nowMs, -10, -3, 0),
    }),

    // 24. Krankmeldung Team
    makeMessage({
      id: 'msg-24',
      threadId: 'th-24',
      mailboxId: 'mb-team',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'sofia.lange@example.de', name: 'Sofia Lange' },
      to: ['team@frankiflow.de'],
      subject: 'Vertretung für Tour Ostend am Donnerstag',
      textBody:
        'Hallo Team, ich habe meinen Arzttermin verschoben und kann die Tour Ostend am Donnerstag doch wie geplant übernehmen.',
      isRead: true,
      timestamp: isoOffset(nowMs, -12, -2, 0),
    }),

    // 25. English follow-up
    makeMessage({
      id: 'msg-25',
      threadId: 'th-25',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'sarah.jenkins@example.com', name: 'Sarah Jenkins' },
      to: ['info@frankiflow.de'],
      subject: 'Follow-up: Carpet cleaning quote for conference rooms',
      textBody:
        'Hi FrankiFlow,\n\nThanks for the carpet cleaning estimate. Our facilities manager approved it—could we schedule it for a Saturday later this month?',
      isRead: true,
      timestamp: isoOffset(nowMs, -14, -5, 0),
    }),

    // 26. Fensterreinigung Kita
    makeMessage({
      id: 'msg-26',
      threadId: 'th-26',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'leitung@kita-sonnenschein.example.org', name: 'Kita Sonnenschein' },
      to: ['info@frankiflow.de'],
      subject: 'Termin für halbjährliche Fensterreinigung',
      textBody:
        'Liebe Frau/Herr FrankiFlow, wir würden gerne wieder einen Samstagstermin für unsere halbjährliche Fensterreinigung abstimmen.',
      isRead: true,
      labelIds: ['lbl-termine'],
      timestamp: isoOffset(nowMs, -18, -4, 0),
    }),

    // 27. Wohnungsreinigung Niederrad
    makeMessage({
      id: 'msg-27',
      threadId: 'th-27',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'felix.baumann@example.de', name: 'Felix Baumann' },
      to: ['info@frankiflow.de'],
      subject: 'Einmalige Wohnungsreinigung in Niederrad',
      textBody:
        'Guten Tag, ich suche für meine 60 m² Wohnung in Niederrad eine einmalige Intensivreinigung vor einem Familienbesuch.',
      isRead: true,
      timestamp: isoOffset(nowMs, -22, -6, 0),
    }),

    // 28. Fortbildung Team
    makeMessage({
      id: 'msg-28',
      threadId: 'th-28',
      mailboxId: 'mb-team',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'schulung@sicher-arbeiten.example.org', name: 'Akademie Sicher Arbeiten' },
      to: ['team@frankiflow.de'],
      subject: 'Unterlagen: Unterweisung Arbeitssicherheit & Gefahrstoffe',
      textBody:
        'Guten Tag, anbei finden Sie die Teilnahmebescheinigungen für Ihre Mitarbeiter zur jährlichen Arbeitssicherheits-Unterweisung.',
      isRead: true,
      labelIds: ['lbl-privat'],
      timestamp: isoOffset(nowMs, -26, -3, 0),
    }),

    // 29. Sonderreinigung nach Renovierung (last month)
    makeMessage({
      id: 'msg-29',
      threadId: 'th-29',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'architektur@stadtbau-ffm.example.de', name: 'Büro Stadtbau' },
      to: ['info@frankiflow.de'],
      subject: 'Baufeinreinigung nach Altbausanierung',
      textBody:
        'Sehr geehrte Damen und Herren, wir benötigen Ende nächsten Monats eine Baufeinreinigung für zwei sanierte Etagen im Bahnhofsviertel.',
      isRead: true,
      labelIds: ['lbl-angebote'],
      timestamp: isoOffset(nowMs, -32, -2, 0),
    }),

    // 30. Quartalsabrechnung (last month)
    makeMessage({
      id: 'msg-30',
      threadId: 'th-30',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'inbox',
      from: { address: 'hausverwaltung@mainblick-hv.example.de', name: 'Sabine Krüger' },
      to: ['info@frankiflow.de'],
      subject: 'Quartalsabrechnung Objekte Bornheim & Nordend',
      textBody:
        'Guten Tag, bitte denken Sie bei der nächsten Sammelrechnung an die Aufschlüsselung nach den drei Hausnummern.',
      isRead: true,
      labelIds: ['lbl-rechnungen'],
      timestamp: isoOffset(nowMs, -38, -5, 0),
    }),

    // 31. Sent: Angebot PDF
    makeMessage({
      id: 'msg-31',
      threadId: 'th-31',
      mailboxId: 'mb-info',
      direction: 'outbound',
      folder: 'sent',
      from: infoSender,
      to: ['k.vogt@praxis-berger.example.de'],
      subject: 'Angebot Büroreinigung Berger Straße',
      textBody:
        'Guten Tag Frau Vogt,\n\nim Anhang erhalten Sie wie besprochen unser Angebot für die wöchentliche Reinigung Ihrer Räumlichkeiten in der Berger Straße.\n\nMit freundlichen Grüßen\nFrankiFlow',
      isRead: true,
      labelIds: ['lbl-angebote'],
      attachments: [
        {
          id: 'att-31-1',
          filename: 'Angebot-Berger-Strasse.pdf',
          contentType: 'application/pdf',
          size: 5400,
        },
      ],
      timestamp: isoOffset(nowMs, 0, -4, -30),
    }),

    // 32. Sent: Terminbestätigung
    makeMessage({
      id: 'msg-32',
      threadId: 'th-32',
      mailboxId: 'mb-info',
      direction: 'outbound',
      folder: 'sent',
      from: infoSender,
      to: ['a.lehmann@example.de'],
      subject: 'Terminbestätigung Wohnungsreinigung Dornbusch',
      textBody:
        'Guten Tag Herr Lehmann,\n\nwir bestätigen Ihren Termin am Freitag um 09:00 Uhr in Dornbusch. Unser Team klingelt pünktlich bei Ihnen.\n\nMit freundlichen Grüßen\nFrankiFlow',
      isRead: true,
      labelIds: ['lbl-termine'],
      timestamp: isoOffset(nowMs, -1, -1, 0),
    }),

    // 33. Sent: Team Einsatzplan
    makeMessage({
      id: 'msg-33',
      threadId: 'th-33',
      mailboxId: 'mb-team',
      direction: 'outbound',
      folder: 'sent',
      from: teamSender,
      to: ['jan.meyer@example.de', 'sofia.lange@example.de'],
      subject: 'Einsatzplan Freitag – Touren Westend & Sachsenhausen',
      textBody:
        'Hallo zusammen, anbei die Übersicht für Freitag: Tour A (Westend) startet um 07:30 Uhr, Tour B (Sachsenhausen) um 08:30 Uhr.',
      isRead: true,
      timestamp: isoOffset(nowMs, -3, -3, 0),
    }),

    // 34. Sent: Zahlungserinnerung
    makeMessage({
      id: 'msg-34',
      threadId: 'th-34',
      mailboxId: 'mb-info',
      direction: 'outbound',
      folder: 'sent',
      from: infoSender,
      to: ['buchhaltung@alpha-media.example.de'],
      subject: 'Freundliche Zahlungserinnerung: Rechnung Nr. 2026-1098',
      textBody:
        'Sehr geehrte Damen und Herren,\n\nwir erlauben uns eine kurze Erinnerung an unsere Rechnung Nr. 2026-1098 vom Vormonat über 340,00 €.\n\nMit freundlichen Grüßen\nFrankiFlow',
      isRead: true,
      labelIds: ['lbl-rechnungen'],
      timestamp: isoOffset(nowMs, -5, -4, 0),
    }),

    // 35. Draft 1
    makeMessage({
      id: 'msg-35',
      threadId: 'th-35',
      mailboxId: 'mb-info',
      direction: 'draft',
      folder: 'drafts',
      from: infoSender,
      to: ['verwaltung@roedelheim-park.example.de'],
      subject: 'Angebot Treppenhausreinigung Rödelheim',
      textBody:
        'Guten Tag,\n\nvielen Dank für den angenehmen Vor-Ort-Termin in Rödelheim. Gerne unterbreiten wir Ihnen folgendes Angebot für die wöchentliche Treppenhausreinigung:',
      isRead: true,
      labelIds: ['lbl-angebote'],
      timestamp: isoOffset(nowMs, 0, -1, 0),
    }),

    // 36. Draft 2
    makeMessage({
      id: 'msg-36',
      threadId: 'th-36',
      mailboxId: 'mb-team',
      direction: 'draft',
      folder: 'drafts',
      from: teamSender,
      to: ['sofia.lange@example.de'],
      subject: 'Wochenplan Team Nordend',
      textBody:
        'Hallo Sofia,\n\nfür die kommende Woche haben wir zwei neue Airbnb-Objekte im Nordend aufgenommen. Details trage ich noch nach.',
      isRead: true,
      timestamp: isoOffset(nowMs, -1, -7, 0),
    }),

    // 37. Scheduled (send in 2 days)
    makeMessage({
      id: 'msg-37',
      threadId: 'th-37',
      mailboxId: 'mb-info',
      direction: 'outbound',
      folder: 'scheduled',
      from: infoSender,
      to: ['nina.keller@example.de'],
      subject: 'Terminerinnerung: Ihre Grundreinigung am Montag',
      textBody:
        'Guten Tag Frau Keller,\n\nkleine Erinnerung an Ihren Reinigungstermin am Montag um 08:30 Uhr. Wir freuen uns auf Sie!\n\nMit freundlichen Grüßen\nFrankiFlow',
      isRead: true,
      labelIds: ['lbl-termine'],
      scheduledAt: isoOffset(nowMs, 2, 0, 0),
      timestamp: isoOffset(nowMs, 0, -2, 0),
    }),

    // 38. Snoozed (until tomorrow 08:00)
    makeMessage({
      id: 'msg-38',
      threadId: 'th-38',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'snoozed',
      from: { address: 'info@praxis-berger.example.de', name: 'Praxisgemeinschaft Berger Straße' },
      to: ['info@frankiflow.de'],
      subject: 'Rückmeldung zum Angebot Praxisreinigung',
      textBody:
        'Guten Tag, wir besprechen Ihr Angebot morgen früh in der Teambesprechung und melden uns anschließend wegen der Vertragsdetails.',
      isRead: false,
      labelIds: ['lbl-angebote'],
      snoozedUntil: tomorrowAtEightIso(nowMs),
      timestamp: isoOffset(nowMs, -1, -3, 0),
    }),

    // 39. Archive 1
    makeMessage({
      id: 'msg-39',
      threadId: 'th-39',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'archive',
      from: { address: 't.becker@bockenheim-atelier.example.de', name: 'Tobias Becker' },
      to: ['info@frankiflow.de'],
      subject: 'Vielen Dank für die Fensterreinigung!',
      textBody:
        'Hallo liebes Team, die Fenster sehen fantastisch aus. Bis zum nächsten Quartal!',
      isRead: true,
      isStarred: true,
      labelIds: ['lbl-angebote'],
      timestamp: isoOffset(nowMs, -15, -2, 0),
    }),

    // 40. Archive 2
    makeMessage({
      id: 'msg-40',
      threadId: 'th-40',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'archive',
      from: { address: 'buchhaltung@nordstern-beratung.example.de', name: 'Nordstern Buchhaltung' },
      to: ['info@frankiflow.de'],
      subject: 'Zahlungsavis Rechnung Nr. 2026-1055',
      textBody:
        'Guten Tag, der Betrag aus Rechnung Nr. 2026-1055 wurde heute per Überweisung angewiesen.',
      isRead: true,
      labelIds: ['lbl-rechnungen'],
      timestamp: isoOffset(nowMs, -20, -4, 0),
    }),

    // 41. Archive 3
    makeMessage({
      id: 'msg-41',
      threadId: 'th-41',
      mailboxId: 'mb-team',
      direction: 'inbound',
      folder: 'archive',
      from: { address: 'jan.meyer@example.de', name: 'Jan Meyer' },
      to: ['team@frankiflow.de'],
      subject: 'Urlaubswunsch Oktober genehmigt',
      textBody: 'Danke für die schnelle Genehmigung meines Urlaubsantrags!',
      isRead: true,
      timestamp: isoOffset(nowMs, -28, -1, 0),
    }),

    // 42. Archive 4 (English)
    makeMessage({
      id: 'msg-42',
      threadId: 'th-42',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'archive',
      from: { address: 'claire.bennett@example.org', name: 'Claire Bennett' },
      to: ['info@frankiflow.de'],
      subject: 'Completed: Airbnb deep clean Westend',
      textBody:
        'Everything looked spotless after the deep clean. Five stars from our guests again!',
      isRead: true,
      timestamp: isoOffset(nowMs, -35, -3, 0),
    }),

    // 43. Spam (phishing-like)
    makeMessage({
      id: 'msg-43',
      threadId: 'th-43',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'spam',
      from: { address: 'security-alert@verify-konto-now.example.com', name: 'Konto-Sicherheitsteam' },
      to: ['info@frankiflow.de'],
      subject: 'DRINGEND: Ihr Geschäftskonto wird in 24 Stunden gesperrt!',
      textBody:
        'Sehr geehrter Kunde, wir haben ungewöhnliche Aktivitäten festgestellt. Bitte bestätigen Sie sofort Ihre Zugangsdaten unter https://verify-konto-now.example.com/login um eine Sperrung zu verhindern.',
      isRead: false,
      timestamp: isoOffset(nowMs, -1, -11, 0),
    }),

    // 44. Trash 1
    makeMessage({
      id: 'msg-44',
      threadId: 'th-44',
      mailboxId: 'mb-info',
      direction: 'inbound',
      folder: 'trash',
      from: { address: 'promo@buero-discount.example.com', name: 'Büro-Discount' },
      to: ['info@frankiflow.de'],
      subject: 'Nur heute: Druckerpapier im Sonderangebot',
      textBody: 'Sparen Sie bis zu 40% auf Kopierpapier und Aktenordner.',
      isRead: true,
      timestamp: isoOffset(nowMs, -16, -6, 0),
    }),

    // 45. Trash 2
    makeMessage({
      id: 'msg-45',
      threadId: 'th-45',
      mailboxId: 'mb-team',
      direction: 'inbound',
      folder: 'trash',
      from: { address: 'sofia.lange@example.de', name: 'Sofia Lange' },
      to: ['team@frankiflow.de'],
      subject: 'Testnachricht Einsatzplan (bitte löschen)',
      textBody: 'Das war nur ein Test für die neue Dienstplan-Liste, kann in den Papierkorb.',
      isRead: true,
      timestamp: isoOffset(nowMs, -24, -2, 0),
    }),
  ];

  const contacts: Contact[] = [
    { address: 'katrin.weber@example.de', name: 'Katrin Weber', lastUsedAt: isoOffset(nowMs, 0, -1) },
    { address: 'l.schmidt@taunus-finanz.example.com', name: 'Lukas Schmidt', lastUsedAt: isoOffset(nowMs, 0, -1) },
    { address: 'hausverwaltung@mainblick-hv.example.de', name: 'Sabine Krüger', lastUsedAt: isoOffset(nowMs, 0, -3) },
    { address: 'claire.bennett@example.org', name: 'Claire Bennett', lastUsedAt: isoOffset(nowMs, 0, -2) },
    { address: 'm.hoffmann@nordstern-beratung.example.de', name: 'Markus Hoffmann', lastUsedAt: isoOffset(nowMs, 0, -2) },
    { address: 'jan.meyer@example.de', name: 'Jan Meyer', lastUsedAt: isoOffset(nowMs, -2, -7) },
    { address: 'sofia.lange@example.de', name: 'Sofia Lange', lastUsedAt: isoOffset(nowMs, -3, -3) },
  ];

  return {
    version: STATE_VERSION,
    users: [
      {
        id: demoUserId,
        email: 'demo@frankiflow.de',
        name: 'Demo Admin',
        role: 'admin',
        mailboxAddresses: ['info@frankiflow.de', 'team@frankiflow.de'],
        passwordHash,
      },
    ],
    mailboxes,
    messages,
    labels,
    contacts,
    settingsByUser: {
      [demoUserId]: { ...DEFAULT_SETTINGS },
    },
    signaturesByUser: {
      [demoUserId]: signatures.map((s) => ({ ...s })),
    },
    templatesByUser: {
      [demoUserId]: templates.map((t) => ({ ...t })),
    },
    customAttachments: {},
  };
}
