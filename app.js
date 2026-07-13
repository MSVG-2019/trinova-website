document.addEventListener('DOMContentLoaded', function () {
  var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
  var MAX = 25 * 1024 * 1024;
  function readFile(file) {
    return new Promise(function (res, rej) {
      var rd = new FileReader();
      rd.onload = function () { res({ filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size, contentBase64: String(rd.result).split(',')[1] || '' }); };
      rd.onerror = rej; rd.readAsDataURL(file);
    });
  }
  function tsToken(f) { var i = f.querySelector('[name="cf-turnstile-response"]'); return (i && i.value) || ''; }
  var f = document.getElementById('contactForm'), s = document.getElementById('formStatus'); if (!f) return;
  f.addEventListener('submit', async function (e) {
    e.preventDefault(); var el = f.elements;
    if (!el['name'].value || !el['email'].value || !el['message'].value) { s.style.color = '#B5121B'; s.textContent = 'Please complete your name, email and message.'; return; }
    var files = [];
    ['attachment1', 'attachment2', 'attachment3'].forEach(function (n) { var fi = el[n]; if (fi && fi.files && fi.files[0]) files.push(fi.files[0]); });
    for (var i = 0; i < files.length; i++) { if (files[i].size > MAX) { s.style.color = '#B5121B'; s.textContent = 'Each attachment must be under 25 MB — please reduce the file or share a link instead.'; return; } }
    s.style.color = '#655F5E'; s.textContent = 'Sending…';
    var atts = [];
    try { for (var k = 0; k < files.length; k++) { atts.push(await readFile(files[k])); } } catch (_) { atts = []; }
    var payload = { name: el['name'].value, email: el['email'].value, organisation: el['organisation'].value, division: el['division'].value, message: el['message'].value, link: el['link'].value, attachments: atts, _gotcha: el['_gotcha'].value, token: tsToken(f) };
    try {
      var r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.ok) { f.reset(); if (window.turnstile) turnstile.reset(); s.style.color = 'var(--deep)'; s.textContent = 'Thank you — your enquiry has been sent. We will be in touch shortly.'; }
      else { var j = {}; try { j = await r.json(); } catch (_) {} s.style.color = '#B5121B'; s.innerHTML = (j && j.error) || 'Sorry, something went wrong — please email <a href="mailto:info@trinovahelveticgroup.ch">info@trinovahelveticgroup.ch</a>.'; }
    } catch (err) { s.style.color = '#B5121B'; s.innerHTML = 'Sorry, something went wrong — please email <a href="mailto:info@trinovahelveticgroup.ch">info@trinovahelveticgroup.ch</a>.'; }
  });
});
