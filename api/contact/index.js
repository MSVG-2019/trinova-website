// TriNova Helvetic Group — website contact form handler.
// Honeypot + Cloudflare Turnstile + Microsoft Graph sendMail to info@.
// Hardened: field length caps, email validation, MIME allow-list, filename
// sanitisation, base64 validation, size cap, and Graph upload-session for
// attachments > 3 MB. Zero external dependencies (Node 18+).
const H = { "Content-Type": "application/json" };
const ALLOWED = new Set(["application/pdf","image/png","image/jpeg","image/webp","text/plain","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
const MAX_BYTES = 25 * 1024 * 1024;
const INLINE_MAX = 3 * 1024 * 1024;
const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
const line = (v, n) => clip(v, n).replace(/[\r\n\t]+/g, " ").trim();
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
function cleanAttachment(a) {
  if (!a || !a.contentBase64) return null;
  const b64 = String(a.contentBase64).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { error: "Attachment could not be read." };
  const bytes = Math.floor(b64.length * 3 / 4);
  if (bytes > MAX_BYTES) return { error: "Attachment too large — please keep it under 25 MB, or share a link instead." };
  const ct = String(a.contentType || "application/octet-stream").toLowerCase();
  if (!ALLOWED.has(ct)) return { error: "Attachment type not accepted (PDF, image, Office document or text)." };
  const fn = ((String(a.filename || "attachment").split(/[\\/]/).pop()) || "attachment").replace(/[^\w.\- ]+/g, "_").replace(/\.{2,}/g, ".").slice(0, 120) || "attachment";
  return { b64, bytes, ct, fn };
}
async function graphToken(context) {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.CLIENT_ID || "", client_secret: process.env.CLIENT_SECRET || "", scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" })
  });
  const j = await r.json(); return j.access_token || null;
}
async function sendMessage(context, token, sender, baseMsg, attachments) {
  const auth = { Authorization: `Bearer ${token}` };
  const small = (attachments || []).filter(a => a.bytes <= INLINE_MAX);
  const large = (attachments || []).filter(a => a.bytes > INLINE_MAX);
  if (large.length === 0) {
    const message = Object.assign({}, baseMsg);
    if (small.length) message.attachments = small.map(a => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.fn, contentType: a.ct, contentBytes: a.b64 }));
    const send = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, { method: "POST", headers: Object.assign({}, auth, { "Content-Type": "application/json" }), body: JSON.stringify({ message, saveToSentItems: true }) });
    return send.status === 202;
  }
  // draft + (small attachments inline) + upload-session for large + send
  const draftBody = Object.assign({}, baseMsg);
  if (small.length) draftBody.attachments = small.map(a => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.fn, contentType: a.ct, contentBytes: a.b64 }));
  const dRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/messages`, { method: "POST", headers: Object.assign({}, auth, { "Content-Type": "application/json" }), body: JSON.stringify(draftBody) });
  const draft = await dRes.json(); if (!draft.id) { context.log("draft failed", dRes.status); return false; }
  for (const a of large) {
    const buf = Buffer.from(a.b64, "base64");
    const sRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/messages/${draft.id}/attachments/createUploadSession`, { method: "POST", headers: Object.assign({}, auth, { "Content-Type": "application/json" }), body: JSON.stringify({ AttachmentItem: { attachmentType: "file", name: a.fn, size: buf.length, contentType: a.ct } }) });
    const sess = await sRes.json(); if (!sess.uploadUrl) { context.log("session failed", sRes.status); return false; }
    const CHUNK = 4 * 1024 * 1024;
    for (let start = 0; start < buf.length; start += CHUNK) {
      const end = Math.min(start + CHUNK, buf.length);
      const put = await fetch(sess.uploadUrl, { method: "PUT", headers: { "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${buf.length}` }, body: buf.subarray(start, end) });
      if (![200, 201, 202].includes(put.status)) { context.log("chunk failed", put.status); return false; }
    }
  }
  const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/messages/${draft.id}/send`, { method: "POST", headers: auth });
  return sendRes.status === 202;
}
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
module.exports.helpers = { cleanAttachment, sendMessage, graphToken, line, clip, validEmail };
