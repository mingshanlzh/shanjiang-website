---
layout: page
permalink: /contact/
title: contact
description: Get in touch.
nav: true
nav_order: 8
---

The best way to reach me is by email at **[shan.jiang@mq.edu.au](mailto:shan.jiang@mq.edu.au)**. You can also use the form below — messages are delivered straight to my inbox.


{% comment %} To activate the form: replace FORMSPREE_ENDPOINT below with your
Formspree endpoint (https://formspree.io/f/xxxxxxx). Until then the form will not
submit — the mailto link above always works. {% endcomment %}

<form action="FORMSPREE_ENDPOINT" method="POST" style="max-width: 34rem;">
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
  <button type="submit"
          style="padding:.6rem 1.4rem; border:none; border-radius:8px; background:var(--global-theme-color); color:#fff; font-weight:600; cursor:pointer;">
    Send message
  </button>
</form>
