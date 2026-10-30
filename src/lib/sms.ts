import { createHmac, timingSafeEqual } from "node:crypto";
import type { Store } from "./store";
import type { Bar, MenuItem, ParsedUpdate } from "./types";
import { applyUpdate, describeUpdate } from "./publish";

export type TextParser = (bar: Bar, menu: MenuItem[], message: string) => Promise<ParsedUpdate>;

const YES = /^(y|yes|yep|yeah|ok|okay|post|post it|confirm|👍)$/i;
const NO = /^(n|no|nope|cancel|stop it|nevermind|never mind)$/i;
const HELP = /^(help|\?)$/i;

const HELP_TEXT =
  "Text me updates like:\n" +
  "• Fri 9pm The Rusty Nails, $5 cover\n" +
  "• Every Tuesday $2 tacos 4-9\n" +
  "• Out of wings\n" +
  "• Closed Thanksgiving\n" +
  "I'll send a preview. Reply YES to post it.";

/** Handles one text from an owner and returns the reply to send back. */
export async function handleOwnerText(
  store: Store,
  input: { to: string; from: string; body: string },
  parse: TextParser,
): Promise<string | null> {
  const bar = await store.findBar({ smsNumber: input.to });
  if (!bar) return null;
  // Ignore texts from numbers that aren't on the bar's owner list.
  if (!bar.ownerPhones.includes(input.from)) return null;

  const body = input.body.trim();
  const pending = (await store.list("pendingUpdates", bar.id)).filter(
    (p) => p.fromPhone === input.from,
  );
  const clearPending = () =>
    Promise.all(pending.map((p) => store.remove("pendingUpdates", bar.id, p.id)));

  if (HELP.test(body)) return HELP_TEXT;

  if (YES.test(body)) {
    const latest = pending.at(-1);
    if (!latest) return "Nothing waiting to post. Text me an update first.";
    await clearPending();
    return applyUpdate(store, bar, latest.update);
  }

  if (NO.test(body)) {
    await clearPending();
    return pending.length ? "Canceled. Nothing was posted." : "Nothing waiting to post.";
  }

  const menu = await store.list("menuItems", bar.id);
  const update = await parse(bar, menu, body);
  await clearPending();
  if (update.kind === "unclear") return update.question;

  await store.create("pendingUpdates", {
    barId: bar.id,
    fromPhone: input.from,
    update,
    createdAt: new Date().toISOString(),
  });
  return `${describeUpdate(update)}\nReply YES to post or NO to cancel.`;
}

/**
 * Checks Twilio's X-Twilio-Signature: base64 HMAC-SHA1 of the full webhook URL
 * followed by each POST parameter name and value, sorted by name.
 */
export function validTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  const expected = Buffer.from(createHmac("sha1", authToken).update(data).digest("base64"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function twiml(message: string | null): string {
  const inner = message ? `<Message>${escapeXml(message)}</Message>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}
