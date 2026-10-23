export type Entry = { id: string; [key: string]: any };
export type LabelLink = { message_id: string; label_id: string };
export type Preferences = {
  theme: "system" | "light" | "dark"; density: "comfortable" | "compact";
  default_sender_address: string; conversation_view: boolean; preview_pane: "right" | "off";
  show_message_preview: boolean; mark_read_on_open: boolean; keyboard_shortcuts: boolean;
  signature_enabled: boolean; confirm_permanent_delete: boolean; notifications_enabled: boolean;
  notification_sound: boolean; ai_enabled: boolean; ai_model: string; ai_tone: string; ai_language: string;
};
export const defaultPreferences: Preferences = {
  theme: "system", density: "comfortable", default_sender_address: "", conversation_view: true,
  preview_pane: "right", show_message_preview: true, mark_read_on_open: true, keyboard_shortcuts: true,
  signature_enabled: false, confirm_permanent_delete: true, notifications_enabled: false,
  notification_sound: false, ai_enabled: true, ai_model: "gemini-3.5-flash-lite", ai_tone: "professional", ai_language: "auto",
};
export const resourceTables = {
  contacts: "frankiflow_mail_contacts", labels: "frankiflow_mail_labels", templates: "frankiflow_mail_templates",
  signatures: "frankiflow_mail_signatures", filters: "frankiflow_mail_filters", events: "frankiflow_mail_events",
} as const;
export type Resource = keyof typeof resourceTables;
export type WorkspaceData = Record<Resource, Entry[]> & { links: LabelLink[]; preferences: Preferences };
export function emptyWorkspace(): WorkspaceData {
  return { contacts: [], labels: [], templates: [], signatures: [], filters: [], events: [], links: [], preferences: { ...defaultPreferences } };
}
export function sampleWorkspace(): WorkspaceData {
  return { ...emptyWorkspace(),
    contacts: [{ id: "sample-contact", email: "emma@example.com", display_name: "Emma Wilson", company: "Studio North", phone: "", notes: "Campaign creative lead" }],
    labels: [{ id: "sample-label", name: "Projects", color: "#287a65" }],
    templates: [{ id: "sample-template", name: "Project follow-up", subject: "A quick project follow-up", text_body: "Hello,\n\nJust checking in on our project. Is there anything you need from me?\n\nThank you!", html_body: "" }],
  };
}
