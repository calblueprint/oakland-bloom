/** Serves the test app's privacy notice without requiring an Oakland Bloom account. */
export function GET() {
  return new Response(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Oakland Bloom Catering Dev — Test Privacy Notice</title>
<style>body{font:18px/1.6 system-ui,sans-serif;max-width:740px;margin:48px auto;padding:0 24px;color:#202820}h1{line-height:1.2}h2{font-size:22px;margin-top:30px}a{color:#245e42}</style>
</head><body><main>
<h1>Oakland Bloom Catering Dev</h1>
<p>Test app privacy notice · Updated November 4, 2026</p>
<p>This development app tests an automated WhatsApp assistant for catering questions and interest responses. It is a test service, and does not confirm bookings or notify staff automatically.</p>
<h2>What we collect and why</h2>
<p>We store your WhatsApp phone number, messages, assistant replies, delivery information, catering interest responses, and requests for human review. We use these records to reply with conversation context and test the app. Testing is limited to approved test numbers.</p>
<h2>Services that process the data</h2>
<p>Meta handles WhatsApp messages. Supabase stores the app's records. Anthropic processes message text, recent conversation context, your saved name, and relevant catering details to generate replies. During local testing, Cloudflare carries incoming messages to the developer's computer. The developer can access stored test records. We do not sell this data or use it for advertising.</p>
<h2>Your choices and deletion requests</h2>
<p>Send STOP or unsubscribe to stop automatic replies. To request access to or deletion of your app records, email the test app developer at <a href="mailto:stpnhh@gmail.com">stpnhh@gmail.com</a>. Deletion requests are handled by the developer, not automatically by the chatbot. Deleting app records does not delete copies held by WhatsApp or other service providers.</p>
<h2>Storage and retention</h2>
<p>Test records remain in the app's Supabase database until the developer removes them. Please avoid sending sensitive personal information. The app is under development and is not an emergency or confidential support channel.</p>
</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
