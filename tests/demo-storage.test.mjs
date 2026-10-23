import test from "node:test";
import assert from "node:assert/strict";
import { parseDemoMessages, demoMessages } from "../src/lib/demo.ts";
test("saved demo messages retain their recipients, files and flags without changing data", () => {
  const original = demoMessages();
  assert.deepEqual(parseDemoMessages(JSON.stringify(original)), original);
  assert.deepEqual(parseDemoMessages("[]"), []);
});
test("malformed sample data is rejected before it can crash the mailbox", () => {
  for (const value of ["{", "null", "{}", "42", "[null]", JSON.stringify([{...demoMessages()[0], to_addresses: {}}]), JSON.stringify([{...demoMessages()[0],created_at:"invalid"}])]) assert.throws(()=>parseDemoMessages(value));
});
