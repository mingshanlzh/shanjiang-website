---
layout: page
title: publish
permalink: /admin/
nav: false
sitemap: false
site_editor: admin
description: How to add news items and blog posts to this site.
---

<style>
  .pub-box { max-width: 40rem; padding: 1rem 1.25rem; border: 1px solid var(--global-divider-color); border-radius: 10px; margin: 0.75rem 0 1.75rem; }
  .pub-box label { display: block; font-weight: 600; margin-bottom: 0.35rem; }
  .pub-box input { width: 100%; padding: 0.55rem 0.75rem; border: 1px solid var(--global-divider-color); border-radius: 8px; background: var(--global-bg-color); color: var(--global-text-color); }
  .pub-hint { font-size: 0.9rem; opacity: 0.8; margin: 0.4rem 0 0.9rem; }
  .pub-buttons { display: flex; flex-wrap: wrap; gap: 0.6rem; }
  .pub-btn { display: inline-block; padding: 0.55rem 1.2rem; border-radius: 8px; background: var(--global-theme-color); color: #fff !important; font-weight: 600; text-decoration: none !important; }
  .pub-btn:hover { opacity: 0.9; }
  details.pub-optional { margin-top: 2.25rem; }
  details.pub-optional summary { cursor: pointer; font-weight: 600; }
</style>

New news items and blog posts are added through GitHub. Each button opens GitHub's editor with a new file that already has the template and today's date in it.

<div class="pub-box">
  <label for="pub-title">Title (optional)</label>
  <input id="pub-title" type="text" autocomplete="off" placeholder="e.g. Notes from AHES 2026">
  <p class="pub-hint">Used for the file name, and as the title of a blog post. You can also change it later in GitHub.</p>
  <div class="pub-buttons">
    <a id="pub-new-post" class="pub-btn" href="https://github.com/mingshanlzh/shanjiang-website/new/main/_posts" target="_blank" rel="noopener">New blog post</a>
    <a id="pub-new-news" class="pub-btn" href="https://github.com/mingshanlzh/shanjiang-website/new/main/_news" target="_blank" rel="noopener">New news item</a>
  </div>
</div>

### Publishing in four steps

1. Click **New blog post** or **New news item**. GitHub opens in a new tab. Sign in to GitHub if it asks.
2. Replace the placeholder text below the second `---` line with your own. For a blog post, also change the `title` and `description` lines at the top.
3. Click **Commit changes…** at the top right, then **Commit changes** in the box that opens.
4. Wait about four minutes, then refresh the [blog](/blog/) or [news](/news/) page. You can watch the build on [GitHub Actions](https://github.com/mingshanlzh/shanjiang-website/actions). A green tick means it is live.

### Other tasks

- **Edit or delete a post.** Open the [blog posts folder](https://github.com/mingshanlzh/shanjiang-website/tree/main/_posts) or the [news folder](https://github.com/mingshanlzh/shanjiang-website/tree/main/_news) and click the file. The pencil icon edits it, and the **⋯** menu has **Delete file**. Then commit as in step 3.
- **Add a picture.** [Upload it to the images folder](https://github.com/mingshanlzh/shanjiang-website/upload/main/assets/img), then put `![What the picture shows](/assets/img/your-file.jpg)` on its own line in the post.
- **Formatting.** `**bold**`, `*italic*`, `[link text](https://example.com)` and `## Subheading`. Leave a blank line between paragraphs.
- **Dates.** Keep the date as today or earlier. A post dated in the future stays hidden until the site is rebuilt after that date.

<details class="pub-optional" id="pub-editor">
<summary>Optional: add and edit on this page instead (needs a one-time sign-in)</summary>

<div id="site-editor-admin">
  <p>Loading the editor…</p>
</div>

</details>

<noscript>The buttons and the editor need JavaScript. You can still add files through the GitHub folders linked above.</noscript>

<script>
  (function () {
    var REPO = "mingshanlzh/shanjiang-website";
    var BRANCH = "main";

    // Today's date in Melbourne time (the site's time zone), as YYYY-MM-DD.
    function today() {
      var d = new Date();
      try {
        var parts = {};
        new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" })
          .formatToParts(d)
          .forEach(function (p) { parts[p.type] = p.value; });
        if (parts.year && parts.month && parts.day) return parts.year + "-" + parts.month + "-" + parts.day;
      } catch (e) {}
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    // Accents are removed by deleting the combining marks left after NFKD normalisation.
    var MARKS = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
    function slug(text, fallback) {
      var s = String(text || "").normalize("NFKD").replace(MARKS, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
      return s || fallback;
    }

    // YAML single-quoted string: a single quote is written twice.
    function yaml(text) {
      return "'" + String(text).replace(/'/g, "''") + "'";
    }

    function newFileLink(dir, name, body) {
      return "https://github.com/" + REPO + "/new/" + BRANCH + "?filename=" + dir + "/" + encodeURIComponent(name) + "&value=" + encodeURIComponent(body);
    }

    var titleInput = document.getElementById("pub-title");

    function update() {
      var day = today();
      var title = titleInput.value.trim();
      var post = [
        "---",
        "layout: post",
        "title: " + yaml(title || "Your title here"),
        "date: " + day,
        "description: " + yaml("One sentence that appears under the title on the blog page."),
        "tags: health-economics",
        "categories: general",
        "---",
        "",
        "Write your post here. Leave a blank line between paragraphs.",
        "",
      ].join("\n");
      var news = [
        "---",
        "layout: post",
        "date: " + day,
        "inline: true",
        "related_posts: false",
        "---",
        "",
        "Write one or two sentences here. **Bold** and [links](https://example.com) work.",
        "",
      ].join("\n");
      document.getElementById("pub-new-post").href = newFileLink("_posts", day + "-" + slug(title, "new-post") + ".md", post);
      document.getElementById("pub-new-news").href = newFileLink("_news", day + "-" + slug(title, "news") + ".md", news);
    }

    titleInput.addEventListener("input", update);
    update();

    // If the owner has signed in to the optional editor on this browser, show it open.
    try {
      if (localStorage.getItem("siteEditor.token") || sessionStorage.getItem("siteEditor.token")) {
        document.getElementById("pub-editor").open = true;
      }
    } catch (e) {}
  })();
</script>
