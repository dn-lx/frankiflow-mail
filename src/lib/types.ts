export type Attachment = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_path?: string;
  dataUrl?: string;
};
export type Message = {
  id: string;
  account_id?: string;
  thread_id?: string;
  reply_to?: string;
  from_name: string;
  from_address: string;
  to_addresses: string[];
  cc_addresses?: string[];
  subject: string;
  text_body: string;
  html_body?: string;
  preview?: string;
  folder: string;
  direction: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  created_at: string;
  attachments?: Attachment[];
};
export type Account = {
  id: string;
  address: string;
  display_name: string;
  is_primary?: boolean;
};
export type Compose = {
  id?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  fromAddress: string;
  thread_id?: string;
};
