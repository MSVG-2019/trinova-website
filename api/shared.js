// Shared helpers for the TriNova website functions (contact + apply).
// Kept in a plain module (no function.json) so neither function folder requires the other.
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
// Parse a Graph error response into a compact { code, detail } for diagnostics/logging.
async function graphErr(res) {
  try { const j = await res.json(); const e = j && j.error; return { code: (e && e.code) || "", detail: (e && e.message ? String(e.message).slice(0, 300) : "") }; }
  catch { return { code: "", detail: "" }; }
}
// Returns { ok, stage, status, code, detail }. ok:true means the message was accepted (202).
async function sendMessage(context, token, sender, baseMsg, attachments) {
  const auth = { Authorization: `Bearer ${token}` };
  const small = (attachments || []).filter(a => a.bytes <= INLINE_MAX);
  const large = (attachments || []).filter(a => a.bytes > INLINE_MAX);
  if (large.length === 0) {
    const message = Object.assign({}, baseMsg);
    if (small.length) message.attachments = small.map(a => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.fn, contentType: a.ct, contentBytes: a.b64 }));
    const send = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, { method: "POST", headers: Object.assign({}, auth, { "Content-Type": "application/json" }), body: JSON.stringify({ message, saveToSentItems: true }) });
    if (send.status === 202) return { ok: true };
    const e = await graphErr(send); context.log("sendMail failed", send.status, e.code, e.detail);
    return { ok: false, stage: "sendMail", status: send.status, code: e.code, detail: e.detail };
  }
  const draftBody = Object.assign({}, baseMsg);
  if (small.length) draftBody.attachments = small.map(a => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.fn, contentType: a.ct, contentBytes: a.b64 }));
  const dRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/messages`, { method: "POST", headers: Object.assign({}, auth, { "Content-Type": "application/json" }), body: JSON.stringify(draftBody) });
  const draft = await dRes.json(); if (!draft.id) { const e = await graphErr(dRes); context.log("draft failed", dRes.status, e.code); return { ok: false, stage: "createDraft", status: dRes.status, code: e.code, detail: e.detail }; }
  for (const a of large) {
    const buf = Buffer.from(a.b64, "base64");
    const sRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/messages/${draft.id}/attachments/createUploadSession`, { method: "POST", headers: Object.assign({}, auth, { "Content-Type": "application/json" }), body: JSON.stringify({ AttachmentItem: { attachmentType: "file", name: a.fn, size: buf.length, contentType: a.ct } }) });
    const sess = await sRes.json(); if (!sess.uploadUrl) { context.log("session failed", sRes.status); return { ok: false, stage: "uploadSession", status: sRes.status }; }
    const CHUNK = 4 * 1024 * 1024;
    for (let start = 0; start < buf.length; start += CHUNK) {
      const end = Math.min(start + CHUNK, buf.length);
      const put = await fetch(sess.uploadUrl, { method: "PUT", headers: { "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${buf.length}` }, body: buf.subarray(start, end) });
      if (![200, 201, 202].includes(put.status)) { context.log("chunk failed", put.status); return { ok: false, stage: "uploadChunk", status: put.status }; }
    }
  }
  const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/messages/${draft.id}/send`, { method: "POST", headers: auth });
  if (sendRes.status === 202) return { ok: true };
  const e = await graphErr(sendRes); context.log("draft send failed", sendRes.status, e.code, e.detail);
  return { ok: false, stage: "draftSend", status: sendRes.status, code: e.code, detail: e.detail };
}
module.exports = { ALLOWED, MAX_BYTES, INLINE_MAX, clip, line, validEmail, cleanAttachment, graphToken, sendMessage };
