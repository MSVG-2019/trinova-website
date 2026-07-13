document.addEventListener('DOMContentLoaded', function () {
  var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();

  function readFile(file) {
    return new Promise(function (res, rej) {
      var rd = new FileReader();
      rd.onload = function () { res({ filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size, contentBase64: String(rd.result).split(',')[1] || '' }); };
      rd.onerror = rej; rd.readAsDataURL(file);
    });
  }
  function tooBig(file) { return file && file.size > 50 * 1024 * 1024; }
  function tsToken(f) { var i = f.querySelector('[name="cf-turnstile-response"]'); return (i && i.value) || ''; }
  async function postForm(f, s, url, payload, successMsg) {
    try {
      var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.ok) { f.reset(); if (window.turnstile) turnstile.reset(); s.style.color = 'var(--deep)'; s.textContent = successMsg; }
      else { var j = {}; try { j = await r.json(); } catch (_) {} s.style.color = '#B5121B'; s.innerHTML = (j && j.error) || 'Sorry, something went wrong — please email <a href="mailto:info@trinovahelveticgroup.ch">info@trinovahelveticgroup.ch</a>.'; }
    } catch (err) { s.style.color = '#B5121B'; s.innerHTML = 'Sorry, something went wrong — please email <a href="mailto:info@trinovahelveticgroup.ch">info@trinovahelveticgroup.ch</a>.'; }
  }

  // ---- Contact form ----
  (function () {
    var f = document.getElementById('contactForm'), s = document.getElementById('formStatus'); if (!f) return;
    f.addEventListener('submit', async function (e) {
      e.preventDefault(); var el = f.elements;
      if (!el['name'].value || !el['email'].value || !el['message'].value) { s.style.color = '#B5121B'; s.textContent = 'Please complete your name, email and message.'; return; }
      s.style.color = '#655F5E'; s.textContent = 'Sending…';
      var att = null, fi = el['attachment'];
      if (fi && fi.files && fi.files[0]) { if (tooBig(fi.files[0])) { s.style.color = '#B5121B'; s.textContent = 'Attachment is too large — please keep it under 50 MB, or share a link instead.'; return; } try { att = await readFile(fi.files[0]); } catch (_) { att = null; } }
      var payload = { name: el['name'].value, email: el['email'].value, organisation: el['organisation'].value, division: el['division'].value, message: el['message'].value, link: el['link'].value, attachment: att, _gotcha: el['_gotcha'].value, token: tsToken(f) };
      await postForm(f, s, '/api/contact', payload, 'Thank you — your enquiry has been sent. We will be in touch shortly.');
    });
  })();

  // ---- Job application form ----
  (function () {
    var f = document.getElementById('applyForm'), s = document.getElementById('applyStatus'); if (!f) return;
    f.addEventListener('submit', async function (e) {
      e.preventDefault(); var el = f.elements;
      if (!el['name'].value || !el['email'].value || !el['role'].value) { s.style.color = '#B5121B'; s.textContent = 'Please complete your name, email and the role.'; return; }
      if (!el['consent'].checked) { s.style.color = '#B5121B'; s.textContent = 'Please confirm your consent to continue.'; return; }
      if (!el['cv'].files || !el['cv'].files[0]) { s.style.color = '#B5121B'; s.textContent = 'Please attach your CV.'; return; }
      if (tooBig(el['cv'].files[0]) || (el['coverLetter'].files[0] && tooBig(el['coverLetter'].files[0]))) { s.style.color = '#B5121B'; s.textContent = 'A file is too large — please keep each under 50 MB.'; return; }
      s.style.color = '#655F5E'; s.textContent = 'Submitting…';
      var cv = null, cl = null;
      try { cv = await readFile(el['cv'].files[0]); if (el['coverLetter'].files[0]) cl = await readFile(el['coverLetter'].files[0]); } catch (_) {}
      var payload = { name: el['name'].value, email: el['email'].value, phone: el['phone'].value, location: el['location'].value, role: el['role'].value, experience: el['experience'].value, languages: el['languages'].value, availability: el['availability'].value, link: el['link'].value, message: el['message'].value, consent: el['consent'].checked, cv: cv, coverLetter: cl, _gotcha: el['_gotcha'].value, token: tsToken(f) };
      await postForm(f, s, '/api/apply', payload, 'Thank you — your application has been submitted. We will be in touch.');
    });
  })();
});
