"use client";

import { useState } from "react";
import type { Account } from "@/lib/types";

export function SignatureSettings({ accounts, values, save, error, ready }: {
  accounts: Account[];
  values: Record<string, string>;
  save: (address: string, text: string) => boolean;
  error: string;
  ready: boolean;
}) {
  const [address, setAddress] = useState(accounts.find((a) => a.is_primary)?.address || accounts[0]?.address || "");
  const [text, setText] = useState(values[address.toLowerCase()] || "");
  const [saved, setSaved] = useState(false);
  return (
    <section className="signature-settings" aria-label="Email signatures">
      <strong>Email signature</strong>
      <p>Save a signature for each sender on this device. Insert it from the composer when you need it.</p>
      <label>
        Signature sender
        <select aria-label="Signature sender" value={address} onChange={(event) => {
          setAddress(event.target.value);
          setText(values[event.target.value.toLowerCase()] || "");
          setSaved(false);
        }}>
          {accounts.map((account) => <option key={account.id} value={account.address}>{account.address}</option>)}
        </select>
      </label>
      <label>
        Signature text
        <textarea aria-label="Signature text" rows={4} maxLength={5000} value={text} placeholder="Your name, role and contact details" onChange={(event) => {
          setText(event.target.value);
          setSaved(false);
        }} />
      </label>
      <button className="secondary-button" disabled={!ready || !address} onClick={() => setSaved(save(address, text))}>Save signature</button>
      {saved && <p role="status">Signature saved on this device.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
