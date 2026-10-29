// Twilio "A message comes in" webhook for each bar's update number.

import { getStore } from "@/lib/store";
import { handleOwnerText, twiml, validTwilioSignature } from "@/lib/sms";
import { parseOwnerText } from "@/lib/parse-text";

export async function POST(request: Request) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    // Behind a proxy the request URL can differ from what Twilio signed, so allow setting it.
    const url = process.env.TWILIO_WEBHOOK_URL ?? request.url;
    const signature = request.headers.get("x-twilio-signature");
    if (!validTwilioSignature(authToken, signature, url, params)) {
      return new Response("Invalid signature", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("TWILIO_AUTH_TOKEN is not set", { status: 500 });
  }

  const store = await getStore();
  let reply: string | null;
  try {
    reply = await handleOwnerText(
      store,
      { to: params.To ?? "", from: params.From ?? "", body: params.Body ?? "" },
      parseOwnerText,
    );
  } catch (error) {
    console.error("Text update failed:", error);
    reply = "Something went wrong and nothing was posted. Please try again, or use the admin page.";
  }

  return new Response(twiml(reply), { headers: { "content-type": "text/xml" } });
}
