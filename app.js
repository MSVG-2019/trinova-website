document.addEventListener('DOMContentLoaded', function () {
  var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
  // Pre-fill the contact form when arriving from Partner Connect (/?topic=partner-access#contact)
  try {
    var tp = new URLSearchParams(location.search).get('topic');
    if (tp === 'partner-access') {
      var dv = document.getElementById('division');
      if (dv) { for (var i = 0; i < dv.options.length; i++) { if (/Partner Connect/i.test(dv.options[i].text)) { dv.selectedIndex = i; break; } } }
      var mg = document.getElementById('message'); if (mg && !mg.value) mg.value = 'I would like to request Partner Connect access.';
    }
  } catch (e) {}
  // Pre-select the engagement on /apply.html?role=madagascar|morocco
  try { var rp = new URLSearchParams(location.search).get('role'); if (rp) { var rs = document.getElementById('ap-role'); if (rs) { for (var j = 0; j < rs.options.length; j++) { if (new RegExp(rp, 'i').test(rs.options[j].text)) { rs.selectedIndex = j; break; } } } } } catch (e) {}
  // Mobile nav: keyboard-operable toggle + aria-expanded
  (function(){ var cb=document.getElementById('navtoggle'), lbl=document.querySelector('.nav-toggle'); if(!cb||!lbl) return; lbl.setAttribute('aria-expanded','false');
    lbl.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){ e.preventDefault(); cb.checked=!cb.checked; lbl.setAttribute('aria-expanded',cb.checked?'true':'false'); } });
    cb.addEventListener('change',function(){ lbl.setAttribute('aria-expanded',cb.checked?'true':'false'); }); })();
  var MAX = 25 * 1024 * 1024, TOTAL = 30 * 1024 * 1024;
  function readFile(file) {
    return new Promise(function (res, rej) {
      var rd = new FileReader();
      rd.onload = function () { res({ filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size, contentBase64: String(rd.result).split(',')[1] || '' }); };
      rd.onerror = rej; rd.readAsDataURL(file);
    });
  }
  function tsToken(f) { var i = f.querySelector('[name="cf-turnstile-response"]'); return (i && i.value) || ''; }
  function checkSizes(files, s) {
    var total = 0;
    for (var i = 0; i < files.length; i++) { if (files[i].size > MAX) { s.style.color = '#B5121B'; s.textContent = 'Each file must be under 25 MB — please reduce it or share a link instead.'; return false; } total += files[i].size; }
    if (total > TOTAL) { s.style.color = '#B5121B'; s.textContent = 'Your files are too large in total — please keep the combined size under 30 MB, or share a link.'; return false; }
    return true;
  }
  async function postForm(f, s, url, payload, ok) {
    try {
      var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.ok) { f.reset(); if (window.turnstile) turnstile.reset(); s.style.color = 'var(--deep)'; s.textContent = ok; }
      else { var j = {}; try { j = await r.json(); } catch (_) {} s.style.color = '#B5121B'; s.innerHTML = (j && j.error) || 'Sorry, something went wrong — please email <a href="mailto:info@trinovahelveticgroup.ch">info@trinovahelveticgroup.ch</a>.'; }
    } catch (err) { s.style.color = '#B5121B'; s.innerHTML = 'Sorry, something went wrong — please email <a href="mailto:info@trinovahelveticgroup.ch">info@trinovahelveticgroup.ch</a>.'; }
  }
  // Contact form (3 attachments)
  (function () {
    var f = document.getElementById('contactForm'), s = document.getElementById('formStatus'); if (!f) return;
    f.addEventListener('submit', async function (e) {
      e.preventDefault(); var el = f.elements;
      if (!el['name'].value || !el['email'].value || !el['message'].value) { s.style.color = '#B5121B'; s.textContent = 'Please complete your name, email and message.'; return; }
      var files = []; ['attachment1', 'attachment2', 'attachment3'].forEach(function (n) { var fi = el[n]; if (fi && fi.files && fi.files[0]) files.push(fi.files[0]); });
      if (!checkSizes(files, s)) return;
      s.style.color = '#655F5E'; s.textContent = 'Sending…';
      var atts = []; try { for (var k = 0; k < files.length; k++) atts.push(await readFile(files[k])); } catch (_) { atts = []; }
      await postForm(f, s, '/api/enquiry', { name: el['name'].value, email: el['email'].value, organisation: el['organisation'].value, division: el['division'].value, message: el['message'].value, link: el['link'].value, attachments: atts, _gotcha: el['_gotcha'].value, token: tsToken(f) }, 'Thank you — your enquiry has been sent. We will be in touch shortly.');
    });
  })();
  // Partner application form (CV + cover letter)
  (function () {
    var f = document.getElementById('applyForm'), s = document.getElementById('applyStatus'); if (!f) return;
    f.addEventListener('submit', async function (e) {
      e.preventDefault(); var el = f.elements;
      if (!el['name'].value || !el['email'].value || !el['role'].value) { s.style.color = '#B5121B'; s.textContent = 'Please complete your name, email and the engagement.'; return; }
      if (!el['consent'].checked) { s.style.color = '#B5121B'; s.textContent = 'Please confirm your consent to continue.'; return; }
      if (!el['cv'].files || !el['cv'].files[0]) { s.style.color = '#B5121B'; s.textContent = 'Please attach your CV.'; return; }
      var files = [el['cv'].files[0]]; if (el['coverLetter'].files[0]) files.push(el['coverLetter'].files[0]);
      if (!checkSizes(files, s)) return;
      s.style.color = '#655F5E'; s.textContent = 'Submitting…';
      var cv = null, cl = null; try { cv = await readFile(el['cv'].files[0]); if (el['coverLetter'].files[0]) cl = await readFile(el['coverLetter'].files[0]); } catch (_) {}
      await postForm(f, s, '/api/apply', { name: el['name'].value, email: el['email'].value, phone: el['phone'].value, location: el['location'].value, role: el['role'].value, experience: el['experience'].value, languages: el['languages'].value, availability: el['availability'].value, link: el['link'].value, message: el['message'].value, consent: el['consent'].checked, cv: cv, coverLetter: cl, _gotcha: el['_gotcha'].value, token: tsToken(f) }, 'Thank you — your application has been submitted. We will be in touch.');
    });
  })();
  // Team profile cards → click to open a modal with a bigger photo + full profile (progressive enhancement)
  (function () {
    var cards = document.querySelectorAll('#team .team-grid .tcard');
    if (!cards.length) return;
    // Build the modal once
    var overlay = document.createElement('div');
    overlay.className = 'tmodal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="tmodal-panel">' +
      '<button type="button" class="tmodal-close" aria-label="Close profile">×</button>' +
      '<div class="tmodal-head"><div class="tmodal-photo"><img alt=""></div><div><h3></h3><p class="role"></p></div></div>' +
      '<div class="tmodal-body"></div></div>';
    document.body.appendChild(overlay);
    document.body.classList.add('tmodal-on');
    var panel = overlay.querySelector('.tmodal-panel'),
        mImg = overlay.querySelector('.tmodal-photo img'),
        mName = overlay.querySelector('.tmodal-head h3'),
        mRole = overlay.querySelector('.tmodal-head .role'),
        mBody = overlay.querySelector('.tmodal-body'),
        closeBtn = overlay.querySelector('.tmodal-close'),
        lastFocus = null;
    function open(data) {
      mImg.src = data.img; mImg.alt = data.name;
      mName.textContent = data.name; mRole.textContent = data.role;
      mBody.innerHTML = '';
      for (var i = 0; i < data.nodes.length; i++) mBody.appendChild(data.nodes[i].cloneNode(true));
      lastFocus = document.activeElement;
      overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden'; closeBtn.focus();
    }
    function close() {
      overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = ''; if (lastFocus) lastFocus.focus();
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    cards.forEach(function (card) {
      var av = card.querySelector('.avatar img'),
          nm = card.querySelector('h3'),
          rl = card.querySelector('.role'),
          det = card.querySelector('details'),
          ps = det ? det.querySelectorAll('p') : [];
      if (!nm || !ps.length) return;
      var data = { img: av ? av.src : '', name: nm.textContent, role: rl ? rl.textContent : '', nodes: ps };
      var cue = document.createElement('p'); cue.className = 'viewcue'; cue.textContent = 'View Full Profile';
      card.appendChild(cue);
      card.classList.add('clickable');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'View full profile: ' + data.name);
      card.addEventListener('click', function () { open(data); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); open(data); } });
    });
  })();
});
