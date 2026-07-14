// TriNova Helvetic Group — website contact form handler.
// Honeypot + Cloudflare Turnstile + Microsoft Graph sendMail to info@.
// Shared helpers live in ../shared.js (MIME allow-list, filename sanitise,
// base64 validation, size cap, Graph upload-session for attachments > 3 MB).
const { cleanAttachment, graphToken, sendMessage, line, clip, validEmail } = require("../shared.js");
const H = { "Content-Type": "application/json" };
module.exports = async function (context, req) {
  const fail = (code, error) => { context.res = { status: code, headers: H, body: JSON.stringify({ error }) }; };
  try {
    const b = (req && req.body) || {};
    if (b._gotcha) { context.res = { status: 200, headers: H, body: JSON.stringify({ ok: true }) }; return; }
    const name = line(b.name, 200), email = line(b.email, 200), organisation = line(b.organisation, 200), division = line(b.division, 120), link = line(b.link, 500), message = clip(b.message, 8000).trim();
    if (!name || !email || !message) return fail(400, "Please complete your name, email and message.");
    if (!validEmail(email)) return fail(400, "Please enter a valid email address.");
    const ip = ((req.headers && (req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"])) || "").split(",")[0].trim();
    const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET || "", response: b.token || "", remoteip: ip }) });
    const ts = await tsRes.json(); if (!ts.success) return fail(400, "Please complete the anti-spam check and try again.");
    let atts = [];
    const rawAtts = Array.isArray(b.attachments) ? b.attachments.slice(0, 3) : (b.attachment ? [b.attachment] : []);
    for (const ra of rawAtts) { const c = cleanAttachment(ra); if (c && c.error) return fail(415, c.error); if (c) atts.push(c); }
    const totalBytes = atts.reduce((t, a) => t + a.bytes, 0);
    if (totalBytes > 30 * 1024 * 1024) return fail(413, "Attachments are too large in total — please keep the combined size under 30 MB, or share a link.");
    const token = await graphToken(context); if (!token) return fail(500, "The form could not be submitted right now. Please email info@trinovahelveticgroup.ch.");
    const sender = process.env.MAIL_SENDER || "info@trinovahelveticgroup.ch";
    const to = process.env.MAIL_TO || sender;
    const text = `Name: ${name}\nEmail: ${email}\nOrganisation: ${organisation || "-"}\nTopic: ${division || "-"}\nLink: ${link || "-"}\n\n${message}\n\n— Sent from the trinovahelveticgroup.ch contact form`;
    const baseMsg = { subject: `[Website Enquiry] — ${name}`, body: { contentType: "Text", content: text }, toRecipients: [{ emailAddress: { address: to } }], replyTo: [{ emailAddress: { address: email, name } }] };
    const ok = await sendMessage(context, token, sender, baseMsg, atts);
    if (ok) { context.res = { status: 200, headers: H, body: JSON.stringify({ ok: true }) }; return; }
    return fail(502, "Could not send right now. Please email info@trinovahelveticgroup.ch.");
  } catch (e) { context.log("contact error", e && e.message); return fail(500, "The form could not be submitted right now. Please email info@trinovahelveticgroup.ch."); }
};
