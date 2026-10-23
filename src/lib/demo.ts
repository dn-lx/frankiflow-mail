import type { Message, Account } from "./types";
export const demoAccounts: Account[] = [
  {
    id: "demo-account",
    address: "alex@example.com",
    display_name: "Alex Morgan",
    is_primary: true,
  },
];
export function demoMessages(): Message[] {
  const seeds = [
    [
      "inbox",
      "Emma Wilson",
      "emma@example.com",
      "A fresh direction for the autumn campaign",
      "Hi Alex,\n\nI’ve pulled together the first round of ideas for the autumn campaign. The direction feels warm, confident, and a little more human.\n\nCould you take a look at the brief before our Thursday catch-up? I’d love your thoughts on the visual direction and the launch timeline.\n\nThanks,\nEmma",
      true,
      true,
      "Campaign brief.txt",
    ],
    [
      "inbox",
      "James Chen",
      "james@example.com",
      "Re: Website launch — final details",
      "Everything is looking great. Let’s confirm the final review for Thursday at 10:00. I’ll bring the updated checklist.\n\nJames",
      false,
      false,
      "",
    ],
    [
      "inbox",
      "Sophie Keller",
      "sophie@example.com",
      "Your October project update",
      "A quick update from the studio: all three milestones are on track. The team has made excellent progress this week.\n\nBest,\nSophie",
      true,
      false,
      "Project update.txt",
    ],
    [
      "inbox",
      "Noah Williams",
      "noah@example.com",
      "Coffee next week?",
      "Hey Alex,\n\nIt’s been a while! Would you have time for a coffee next Tuesday? There’s a lovely new place around the corner.\n\nNoah",
      false,
      false,
      "",
    ],
    [
      "inbox",
      "Olivia Brown",
      "olivia@example.com",
      "Brand assets are ready for review",
      "The new assets are ready. Let me know what you think of the revised color palette and typography.\n\nOlivia",
      false,
      true,
      "Brand notes.txt",
    ],
    [
      "inbox",
      "Studio Weekly",
      "weekly@example.com",
      "A little inspiration for your Friday",
      "This week: thoughtful design, small details, and ideas worth making time for. Have a wonderful weekend.",
      false,
      false,
      "",
    ],
    [
      "sent",
      "Alex Morgan",
      "alex@example.com",
      "Q4 proposal and next steps",
      "Hi Emma,\n\nHere is the proposal we discussed. I’ve attached the notes so you have everything in one place.\n\nBest,\nAlex",
      false,
      false,
      "Proposal notes.txt",
    ],
    [
      "archive",
      "Daniel Park",
      "daniel@example.com",
      "Thanks for a great workshop",
      "Thanks again for joining us. It was a pleasure working with your team.",
      false,
      false,
      "",
    ],
  ];
  return seeds.map((s, i) => ({
    id: `demo-${i}`,
    from_name: String(s[1]),
    from_address: String(s[2]),
    to_addresses: [s[0] === "sent" ? "emma@example.com" : "alex@example.com"],
    subject: String(s[3]),
    text_body: String(s[4]),
    folder: String(s[0]),
    direction: s[0] === "sent" ? "outbound" : "inbound",
    is_read: !s[5],
    is_starred: Boolean(s[6]),
    has_attachments: Boolean(s[7]),
    created_at: new Date(Date.now() - (i * 54 + 12) * 60000).toISOString(),
    attachments: s[7]
      ? [
          {
            id: `file-${i}`,
            filename: String(s[7]),
            content_type: "text/plain",
            size_bytes: 63,
            dataUrl:
              "data:text/plain;charset=utf-8,Sample%20document%20for%20the%20FrankiFlow%20Mail%20development%20mailbox.",
          },
        ]
      : [],
  }));
}

export function parseDemoMessages(raw: string): Message[] {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(m => m && typeof m === "object" && typeof m.id === "string" && typeof m.folder === "string" && typeof m.from_address === "string" && Array.isArray(m.to_addresses) && m.to_addresses.every((address: unknown) => typeof address === "string") && typeof m.subject === "string" && typeof m.text_body === "string" && Number.isFinite(Date.parse(m.created_at)))) throw new Error("Saved sample mailbox is invalid.");
  return data;
}
