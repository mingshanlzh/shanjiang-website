---
layout: page
permalink: /contact/
title: contact
description: Get in touch.
nav: true
nav_order: 7
---

The best way to reach me is by email at **[shan.jiang@mq.edu.au](mailto:shan.jiang@mq.edu.au)**. You can also use the form below — messages are delivered straight to my inbox.

<form id="contact-form" style="max-width: 34rem;">
  <div style="margin-bottom: 1rem;">
    <label for="name" style="display:block; margin-bottom:.35rem; font-weight:600;">Name</label>
    <input type="text" id="name" name="name" required
           style="width:100%; padding:.6rem .75rem; border:1px solid var(--global-divider-color); border-radius:8px; background:var(--global-bg-color); color:var(--global-text-color);">
  </div>
  <div style="margin-bottom: 1rem;">
    <label for="email" style="display:block; margin-bottom:.35rem; font-weight:600;">Email</label>
    <input type="email" id="email" name="email" required
           style="width:100%; padding:.6rem .75rem; border:1px solid var(--global-divider-color); border-radius:8px; background:var(--global-bg-color); color:var(--global-text-color);">
  </div>
  <div style="margin-bottom: 1rem;">
    <label for="message" style="display:block; margin-bottom:.35rem; font-weight:600;">Message</label>
    <textarea id="message" name="message" rows="6" required
              style="width:100%; padding:.6rem .75rem; border:1px solid var(--global-divider-color); border-radius:8px; background:var(--global-bg-color); color:var(--global-text-color);"></textarea>
  </div>
  <button id="contact-submit" type="submit"
          style="padding:.6rem 1.4rem; border:none; border-radius:8px; background:var(--global-theme-color); color:#fff; font-weight:600; cursor:pointer;">
    Send message
  </button>
  <span id="contact-status" style="margin-left:.75rem; font-size:.92rem;"></span>
</form>

<script>
  (function () {
    var form = document.getElementById('contact-form');
    var status = document.getElementById('contact-status');
    var btn = document.getElementById('contact-submit');
    var ENDPOINT = 'https://formspree.io/f/xojgjvew';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      btn.disabled = true; btn.style.opacity = '0.6';
      status.textContent = 'Sending…'; status.style.color = 'var(--global-text-color)';
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      }).then(function (r) {
        if (r.ok) {
          form.reset();
          status.textContent = '✓ Thank you — your message has been sent.';
          status.style.color = 'var(--global-theme-color)';
        } else {
          return r.json().then(function (d) {
            throw new Error((d.errors && d.errors.map(function(x){return x.message;}).join(', ')) || 'submission failed');
          });
        }
      }).catch(function (err) {
        status.textContent = '✗ Sorry, something went wrong. Please email me directly.';
        status.style.color = '#c0392b';
      }).finally(function () {
        btn.disabled = false; btn.style.opacity = '1';
      });
    });
  })();
</script>
