# frankiflow_mail_* schema (live, read-only snapshot)

## public.frankiflow_mail_users (rows 1, RLS true)
- user_id: uuid
- email: text
- role: text default 'admin'::text
- active: boolean default true
- created_at: timestamp with time zone default now()
- PK: ["user_id"]
- FK: frankiflow_mail_users_user_id_fkey->

## public.frankiflow_mail_accounts (rows 3, RLS true)
- id: uuid default gen_random_uuid()
- address: text
- display_name: text default 'FrankiFlow'::text
- is_primary: boolean default false
- created_at: timestamp with time zone default now()
- PK: ["id"]
- FK: frankiflow_mail_messages_account_id_fkey->; frankiflow_mail_signatures_account_id_fkey->; frankiflow_mail_user_accounts_account_id_fkey->; frankiflow_mail_events_organizer_account_id_fkey->

## public.frankiflow_mail_threads (rows 247, RLS true)
- id: uuid default gen_random_uuid()
- subject: text default ''::text
- last_message_at: timestamp with time zone default now()
- message_count: integer default 0
- created_at: timestamp with time zone default now()
- normalized_subject: text
- PK: ["id"]
- FK: frankiflow_mail_messages_thread_id_fkey->

## public.frankiflow_mail_messages (rows 208, RLS true)
- id: uuid default gen_random_uuid()
- thread_id: uuid
- account_id: uuid
- provider_message_id: text
- in_reply_to: text
- references_header: text
- direction: text
- folder: text default 'inbox'::text
- from_address: text
- from_name: text
- to_addresses: ARRAY default '{}'::text[]
- cc_addresses: ARRAY default '{}'::text[]
- bcc_addresses: ARRAY default '{}'::text[]
- reply_to: text
- subject: text default ''::text
- text_body: text
- html_body: text
- preview: text
- is_read: boolean default false
- is_starred: boolean default false
- has_attachments: boolean default false
- sent_at: timestamp with time zone
- received_at: timestamp with time zone
- created_at: timestamp with time zone default now()
- updated_at: timestamp with time zone default now()
- snoozed_until: timestamp with time zone
- scheduled_at: timestamp with time zone
- priority: text default 'normal'::text
- is_pinned: boolean default false
- is_muted: boolean default false
- category: text default 'primary'::text
- resend_email_id: text
- internet_message_id: text
- trashed_at: timestamp with time zone
- PK: ["id"]
- FK: frankiflow_mail_messages_account_id_fkey->; frankiflow_mail_message_labels_message_id_fkey->; frankiflow_mail_attachments_message_id_fkey->; frankiflow_mail_messages_thread_id_fkey->

## public.frankiflow_mail_attachments (rows 20, RLS true)
- id: uuid default gen_random_uuid()
- message_id: uuid
- filename: text
- content_type: text
- size_bytes: bigint
- storage_path: text
- created_at: timestamp with time zone default now()
- PK: ["id"]
- FK: frankiflow_mail_attachments_message_id_fkey->

## public.frankiflow_mail_labels (rows 4, RLS true)
- id: uuid default gen_random_uuid()
- name: text
- color: text default '#0c3447'::text
- created_by: uuid
- created_at: timestamp with time zone default now()
- system_key: text
- PK: ["id"]
- FK: frankiflow_mail_message_labels_label_id_fkey->; frankiflow_mail_labels_created_by_fkey->

## public.frankiflow_mail_message_labels (rows 98, RLS true)
- message_id: uuid
- label_id: uuid
- created_at: timestamp with time zone default now()
- PK: ["message_id","label_id"]
- FK: frankiflow_mail_message_labels_label_id_fkey->; frankiflow_mail_message_labels_message_id_fkey->

## public.frankiflow_mail_contacts (rows 107, RLS true)
- id: uuid default gen_random_uuid()
- email: text
- display_name: text
- company: text
- phone: text
- notes: text
- use_count: integer default 0
- last_used_at: timestamp with time zone
- created_at: timestamp with time zone default now()
- updated_at: timestamp with time zone default now()
- PK: ["id"]

## public.frankiflow_mail_templates (rows 0, RLS true)
- id: uuid default gen_random_uuid()
- name: text
- subject: text default ''::text
- text_body: text default ''::text
- html_body: text
- created_by: uuid
- is_shared: boolean default false
- created_at: timestamp with time zone default now()
- updated_at: timestamp with time zone default now()
- PK: ["id"]
- FK: frankiflow_mail_templates_created_by_fkey->

## public.frankiflow_mail_settings (rows 1, RLS true)
- user_id: uuid
- theme: text default 'system'::text
- density: text default 'comfortable'::text
- signature_html: text default ''::text
- signature_enabled: boolean default true
- keyboard_shortcuts: boolean default true
- conversation_view: boolean default true
- preview_pane: text default 'right'::text
- created_at: timestamp with time zone default now()
- updated_at: timestamp with time zone default now()
- default_sender_address: text
- notifications_enabled: boolean default true
- notification_sound: boolean default false
- show_message_preview: boolean default true
- mark_read_on_open: boolean default true
- confirm_permanent_delete: boolean default true
- ai_enabled: boolean default true
- ai_model: text default 'gpt-5.6-luna'::text
- ai_tone: text default 'professional'::text
- ai_language: text default 'auto'::text
- PK: ["user_id"]
- FK: frankiflow_mail_settings_user_id_fkey->

## public.frankiflow_mail_filters (rows 0, RLS true)
- id: uuid default gen_random_uuid()
- name: text
- conditions: jsonb default '{}'::jsonb
- actions: jsonb default '{}'::jsonb
- active: boolean default true
- created_by: uuid
- created_at: timestamp with time zone default now()
- updated_at: timestamp with time zone default now()
- PK: ["id"]
- FK: frankiflow_mail_filters_created_by_fkey->

## public.frankiflow_mail_signatures (rows 2, RLS true)
- id: uuid default gen_random_uuid()
- user_id: uuid
- account_id: uuid
- name: text
- html_body: text default ''::text
- is_default: boolean default false
- created_at: timestamp with time zone default now()
- updated_at: timestamp with time zone default now()
- PK: ["id"]
- FK: frankiflow_mail_signatures_account_id_fkey->; frankiflow_mail_signatures_user_id_fkey->

## public.frankiflow_mail_push_subscriptions (rows 0, RLS true)
- id: uuid default gen_random_uuid()
- user_id: uuid
- endpoint: text
- p256dh: text
- auth: text
- user_agent: text
- device_name: text
- enabled: boolean default true
- created_at: timestamp with time zone default now()
- updated_at: timestamp with time zone default now()
- last_seen_at: timestamp with time zone default now()
- PK: ["id"]
- FK: frankiflow_mail_push_subscriptions_user_id_fkey->

## public.frankiflow_mail_events (rows 0, RLS true)
- id: uuid default gen_random_uuid()
- user_id: uuid
- organizer_account_id: uuid
- title: text default ''::text
- start_at: timestamp with time zone
- end_at: timestamp with time zone
- timezone: text default 'Europe/Berlin'::text
- all_day: boolean default false
- required_attendees: ARRAY default '{}'::text[]
- optional_attendees: ARRAY default '{}'::text[]
- location: text
- description: text
- meeting_provider: text default 'none'::text
- meeting_url: text
- recurrence_rule: text
- reminder_minutes: ARRAY default '{15}'::integer[]
- show_as: text default 'busy'::text
- response_requested: boolean default true
- status: text default 'draft'::text
- uid: text
- sequence: integer default 0
- created_at: timestamp with time zone default now()
- updated_at: timestamp with time zone default now()
- PK: ["id"]
- FK: frankiflow_mail_events_organizer_account_id_fkey->; frankiflow_mail_events_user_id_fkey->

## public.frankiflow_mail_meetings (rows 0, RLS true)
- id: uuid default gen_random_uuid()
- created_by: uuid
- title: text
- starts_at: timestamp with time zone
- ends_at: timestamp with time zone
- timezone: text default 'Europe/Berlin'::text
- attendees: ARRAY default '{}'::text[]
- location: text
- meeting_url: text
- notes: text
- status: text default 'scheduled'::text
- invitation_sent_at: timestamp with time zone
- created_at: timestamp with time zone default now()
- updated_at: timestamp with time zone default now()
- PK: ["id"]
- FK: frankiflow_mail_meetings_created_by_fkey->

## public.frankiflow_mail_user_accounts (rows 1, RLS true)
- user_id: uuid
- account_id: uuid
- can_send: boolean default true
- is_default: boolean default false
- created_at: timestamp with time zone default now()
- PK: ["user_id","account_id"]
- FK: frankiflow_mail_user_accounts_user_id_fkey->; frankiflow_mail_user_accounts_account_id_fkey->

