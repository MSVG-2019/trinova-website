// TriNova Helvetic Group — website contact form handler.
// Verifies Cloudflare Turnstile + honeypot, then sends the enquiry to
// info@trinovahelveticgroup.ch via Microsoft Graph (client-credentials).
// Zero external dependencies (Node 18+ global fetch / URLSearchParams).
module.exports = async function (context, req) {
  const H = { "Content-Type": "application/json" };
  const fail = (code, error) => { context.res = { status: code, headers: H, body: JSON.stringify({ error }) }; };
  try {
    const b = (req && req.body) || {};

    // 1) Honeypot — silently accept & drop bots
    if (b._gotcha) { context.res = { status: 200, headers: H, body: JSON.stringify({ ok: true }) }; return; }

    // 2) Required fields
    if (!b.name || !b.email || !b.message) return fail(400, "Please complete your name, email and message.");

    // 3) Cloudflare Turnstile
    const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET || "", response: b.token || "" })
    });
    const ts = await tsRes.json();
    if (!ts.success) return fail(400, "Please complete the anti-spam check and try again.");

    // 4) Microsoft Graph app token (client credentials)
    const tokRes = await fetch(`https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID || "", client_secret: process.env.CLIENT_SECRET || "",
        scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials"
      })
    });
    const tok = await tokRes.json();
    if (!tok.access_token) { context.log("token error", JSON.stringify(tok)); return fail(500, "The form isn't fully set up yet. Please email info@trinovahelveticgroup.ch."); }

    // 5) Send via Graph
    const sender = process.env.MAIL_SENDER || "info@trinovahelveticgroup.ch";
    const to = process.env.MAIL_TO || sender;
    const text =
      `Name: ${b.name}\nEmail: ${b.email}\nOrganisation: ${b.organisation || "-"}\n` +
      `Topic: ${b.division || "-"}\nLink: ${b.link || "-"}\n\n${b.message}\n\n— Sent from the trinovahelveticgroup.ch contact form`;
    const message = {
      subject: `[Website Enquiry] — ${b.name}`,
      body: { contentType: "Text", content: text },
      toRecipients: [{ emailAddress: { address: to } }],
      replyTo: [{ emailAddress: { address: b.email, name: b.name } }]
    };
    // Optional file attachment (base64 from the browser; cap ~8MB of raw bytes)
    const a = b.attachment;
    if (a && a.contentBase64) {
      if (a.contentBase64.length > 11 * 1024 * 1024) return fail(413, "Attachment is too large — please keep it under 8 MB.");
      message.attachments = [{
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.filename || "attachment",
        contentType: a.contentType || "application/octet-stream",
        contentBytes: a.contentBase64
      }];
    }
    const mail = { message, saveToSentItems: false };
    const send = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
      method: "POST", headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(mail)
    });
    if (send.status === 202) { context.res = { status: 200, headers: H, body: JSON.stringify({ ok: true }) }; return; }
    context.log("sendMail failed", send.status, await send.text());
    return fail(502, "Could not send right now. Please email info@trinovahelveticgroup.ch.");
  } catch (e) {
    context.log("contact handler error", e && e.message);
    return fail(500, "Server error. Please email info@trinovahelveticgroup.ch.");
  }
};
