// TriNova Helvetic Group — partner application handler (independent-partner engagements).
// Reuses the hardened helpers from the contact function. Emails the application +
// CV (+ cover letter) to careers/info@. Not an employment application.
const { cleanAttachment, sendMessage, graphToken, line, clip, validEmail } = require("../shared.js");
const H = { "Content-Type": "application/json" };
module.exports = async function (context, req) {
  const fail = (code, error) => { context.res = { status: code, headers: H, body: JSON.stringify({ error }) }; };
  try {
    const b = (req && req.body) || {};
    if (b._gotcha) { context.res = { status: 200, headers: H, body: JSON.stringify({ ok: true }) }; return; }
    const name = line(b.name, 200), email = line(b.email, 200), phone = line(b.phone, 60),
      location = line(b.location, 160), role = line(b.role, 160), linkUrl = line(b.link, 500),
      experience = line(b.experience, 60), languages = line(b.languages, 200),
      availability = line(b.availability, 160), about = clip(b.message, 8000).trim();
    if (!name || !email || !role) return fail(400, "Please complete your name, email and the engagement.");
    if (!validEmail(email)) return fail(400, "Please enter a valid email address.");
    if (!b.consent) return fail(400, "Please confirm you consent to us processing your application.");
    const ip = ((req.headers && (req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"])) || "").split(",")[0].trim();
    const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET || "", response: b.token || "", remoteip: ip }) });
    const ts = await tsRes.json(); if (!ts.success) return fail(400, "Please complete the anti-spam check and try again.");
    let atts = [];
    const cvC = cleanAttachment(b.cv);
    if (cvC && cvC.error) return fail(415, "CV: " + cvC.error);
    if (!cvC) return fail(400, "Please attach your CV.");
    cvC.fn = "CV - " + cvC.fn; atts.push(cvC);
    const clC = cleanAttachment(b.coverLetter);
    if (clC && clC.error) return fail(415, "Cover letter: " + clC.error);
    if (clC) { clC.fn = "Cover Letter - " + clC.fn; atts.push(clC); }
    const totalBytes = atts.reduce((t, a) => t + a.bytes, 0);
    if (totalBytes > 30 * 1024 * 1024) return fail(413, "Your files are too large in total — please keep the combined size under 30 MB.");
    const token = await graphToken(context); if (!token) return fail(500, "The application could not be submitted right now. Please email info@trinovahelveticgroup.ch.");
    const sender = process.env.MAIL_SENDER || "info@trinovahelveticgroup.ch";
    const to = process.env.CAREERS_TO || process.env.MAIL_TO || sender;
    const text = `Partner Application (independent engagement)\n\nEngagement: ${role}\nName: ${name}\nEmail: ${email}\nPhone: ${phone || "-"}\nLocation: ${location || "-"}\nYears of experience: ${experience || "-"}\nLanguages: ${languages || "-"}\nEarliest availability: ${availability || "-"}\nLink (LinkedIn/portfolio): ${linkUrl || "-"}\n\nAbout their practice:\n${about || "-"}\n\n— Submitted via the trinovahelveticgroup.ch partner-application form. The applicant confirmed consent to processing to assess a potential independent partnership.`;
    const baseMsg = { subject: `[Partner Application] — ${role} — ${name}`, body: { contentType: "Text", content: text }, toRecipients: [{ emailAddress: { address: to } }], replyTo: [{ emailAddress: { address: email, name } }] };
    const send = await sendMessage(context, token, sender, baseMsg, atts);
    if (send && send.ok) { context.res = { status: 200, headers: H, body: JSON.stringify({ ok: true }) }; return; }
    context.log("apply send failed", send && send.stage, send && send.status, send && send.code, send && send.detail);
    return fail(502, "Could not submit right now. Please email your application to info@trinovahelveticgroup.ch.");
  } catch (e) { context.log("apply error", e && e.message); return fail(500, "The application could not be submitted right now. Please email info@trinovahelveticgroup.ch."); }
};
