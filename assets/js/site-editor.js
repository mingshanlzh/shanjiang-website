/*
 * Site editor for shanjiang.info
 *
 * Adds, edits and deletes news items and blog posts from the website itself.
 * Saving writes a Markdown file to the GitHub repository through the GitHub
 * REST API. The repository's "Deploy site" workflow then rebuilds the site,
 * so a change is live a few minutes after it is saved.
 *
 * Visitors see nothing. The controls appear only in a browser where the owner
 * has signed in on /admin/ with a GitHub token that can write to the repository.
 * The token is kept in that browser only (localStorage or sessionStorage).
 */
(function () {
  "use strict";

  var CFG = window.SITE_EDITOR_CONFIG || {};
  var REPO = CFG.repo || "";
  var BRANCH = CFG.branch || "main";
  var ADMIN_URL = CFG.adminUrl || "/admin/";
  var PAGE = CFG.page || {};
  var API = "https://api.github.com";
  var TOKEN_KEY = "siteEditor.token";
  var LOGIN_KEY = "siteEditor.login";
  var DIRS = { news: "_news", posts: "_posts" };
  var NOUN = { news: "news item", posts: "blog post" };

  if (!REPO || typeof fetch !== "function") return;

  /* ------------------------------------------------------------------ *
   * Token storage
   * ------------------------------------------------------------------ */
  function store(remember) {
    return remember ? window.localStorage : window.sessionStorage;
  }
  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }
  function getLogin() {
    try {
      return localStorage.getItem(LOGIN_KEY) || sessionStorage.getItem(LOGIN_KEY) || "";
    } catch (e) {
      return "";
    }
  }
  function saveToken(token, login, remember) {
    try {
      clearToken();
      store(remember).setItem(TOKEN_KEY, token);
      store(remember).setItem(LOGIN_KEY, login);
    } catch (e) {
      /* storage blocked: the session simply will not persist */
    }
  }
  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LOGIN_KEY);
      sessionStorage.removeItem(LOGIN_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  /* ------------------------------------------------------------------ *
   * GitHub API
   * ------------------------------------------------------------------ */
  function gh(method, path, body, tokenOverride) {
    var headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    var token = tokenOverride || getToken();
    if (token) headers.Authorization = "Bearer " + token;
    if (body) headers["Content-Type"] = "application/json";
    return fetch(API + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {
          data = text;
        }
        if (!res.ok) {
          var err = new Error(explain(res.status, data, method));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function explain(status, data, method) {
    var msg = data && data.message ? String(data.message) : "";
    if (status === 401) {
      return "GitHub did not accept the token. It may have expired or been revoked. Sign out and sign in with a new token.";
    }
    if (status === 403 && /rate limit/i.test(msg)) {
      return "GitHub's rate limit was reached. Wait a few minutes and try again.";
    }
    if (status === 403 || (status === 404 && method !== "GET")) {
      return "The token cannot write to " + REPO + ". Check that it has access to this repository with Contents set to 'Read and write'.";
    }
    if (status === 409) {
      return "This file changed on GitHub after you opened it. Close the editor, reload the page and try again.";
    }
    if (status === 422) {
      return "GitHub rejected the change (" + msg + ").";
    }
    return "GitHub returned an error" + (status ? " (" + status + ")" : "") + (msg ? ": " + msg : ".");
  }

  function contentsUrl(path) {
    return "/repos/" + REPO + "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  }
  function getFile(path) {
    return gh("GET", contentsUrl(path) + "?ref=" + encodeURIComponent(BRANCH));
  }
  function readFile(path) {
    return getFile(path).then(function (f) {
      return { path: path, sha: f.sha, text: b64decode(f.content) };
    });
  }
  function fileExists(path) {
    return getFile(path).then(
      function () {
        return true;
      },
      function (e) {
        if (e.status === 404) return false;
        throw e;
      },
    );
  }
  function writeFile(path, text, message, sha) {
    var body = { message: message, content: b64encode(text), branch: BRANCH };
    if (sha) body.sha = sha;
    return gh("PUT", contentsUrl(path), body);
  }
  function removeFile(path, sha, message) {
    return gh("DELETE", contentsUrl(path), { message: message, sha: sha, branch: BRANCH });
  }
  function listDir(dir) {
    return gh("GET", contentsUrl(dir) + "?ref=" + encodeURIComponent(BRANCH)).then(
      function (items) {
        return (items || []).filter(function (i) {
          return i.type === "file" && /\.(md|markdown|html)$/i.test(i.name);
        });
      },
      function (e) {
        if (e.status === 404) return [];
        throw e;
      },
    );
  }

  /* UTF-8 safe base64 */
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(String(b64 || "").replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  /* ------------------------------------------------------------------ *
   * Front matter
   * ------------------------------------------------------------------ */
  function unquote(v) {
    v = String(v == null ? "" : v).trim();
    if (v.length >= 2 && v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') {
      return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    if (v.length >= 2 && v.charAt(0) === "'" && v.charAt(v.length - 1) === "'") {
      return v.slice(1, -1).replace(/''/g, "'");
    }
    return v;
  }
  function quote(v) {
    return '"' + String(v).replace(/[\r\n]+/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  /* Parses "---\nkey: value\n---\nbody". Lines that do not start a key (lists,
     folded text) stay attached to the key above them, so untouched keys are
     written back exactly as they were. */
  function parseDoc(text) {
    var m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(text || "");
    if (!m) return { fm: [], body: text || "" };
    var fm = [];
    m[1].split(/\r?\n/).forEach(function (line) {
      var kv = /^([A-Za-z0-9_-]+):(?:\s+(.*))?\s*$/.exec(line);
      if (kv) fm.push({ key: kv[1], raw: line, value: kv[2] || "", more: [] });
      else if (fm.length) fm[fm.length - 1].more.push(line);
      else fm.push({ key: null, raw: line, value: "", more: [] });
    });
    return { fm: fm, body: m[2].replace(/^\s*\r?\n/, "") };
  }
  function fmGet(doc, key) {
    for (var i = 0; i < doc.fm.length; i++) {
      var e = doc.fm[i];
      if (e.key !== key) continue;
      if (e.more.length) {
        var listItems = e.more
          .map(function (l) {
            var li = /^\s*-\s+(.*)$/.exec(l);
            return li ? unquote(li[1]) : null;
          })
          .filter(function (x) {
            return x !== null;
          });
        if (listItems.length) return listItems.join(" ");
        return e.more
          .map(function (l) {
            return l.trim();
          })
          .join(" ")
          .trim();
      }
      var v = e.value.trim();
      if (/^\[.*\]$/.test(v)) {
        return v
          .slice(1, -1)
          .split(",")
          .map(function (x) {
            return unquote(x);
          })
          .filter(Boolean)
          .join(" ");
      }
      return unquote(v);
    }
    return "";
  }
  function fmSet(doc, key, rawValue) {
    var idx = -1;
    for (var i = 0; i < doc.fm.length; i++) {
      if (doc.fm[i].key === key) {
        idx = i;
        break;
      }
    }
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      if (idx >= 0) doc.fm.splice(idx, 1);
      return;
    }
    var entry = { key: key, raw: key + ": " + rawValue, value: rawValue, more: [] };
    if (idx >= 0) doc.fm[idx] = entry;
    else doc.fm.push(entry);
  }
  function serialise(doc) {
    var lines = [];
    doc.fm.forEach(function (e) {
      lines.push(e.raw);
      e.more.forEach(function (l) {
        lines.push(l);
      });
    });
    return "---\n" + lines.join("\n") + "\n---\n\n" + String(doc.body || "").replace(/\s+$/, "") + "\n";
  }

  /* ------------------------------------------------------------------ *
   * Dates, slugs and paths
   * ------------------------------------------------------------------ */
  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function isoDay(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function stamp(d) {
    var off = -d.getTimezoneOffset();
    var sign = off >= 0 ? "+" : "-";
    off = Math.abs(off);
    return (
      isoDay(d) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + sign + pad(Math.floor(off / 60)) + pad(off % 60)
    );
  }
  /* Today: a few minutes before now, so the build never sees a future date.
     Other days: 9 am local time. */
  function stampForDay(day) {
    var p = day.split("-").map(Number);
    var now = new Date();
    if (day === isoDay(now)) return stamp(new Date(now.getTime() - 5 * 60 * 1000));
    return stamp(new Date(p[0], p[1] - 1, p[2], 9, 0, 0));
  }
  function dayOf(dateValue) {
    var m = /^(\d{4}-\d{2}-\d{2})/.exec(String(dateValue || ""));
    return m ? m[1] : "";
  }
  function isFuture(day) {
    return day > isoDay(new Date());
  }
  function plainText(md) {
    return String(md || "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/[*_`#>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function slugify(s, fallback) {
    var slug = plainText(s)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")
      .slice(0, 7)
      .join("-")
      .slice(0, 60)
      .replace(/-+$/, "");
    return slug || fallback;
  }
  function uniquePath(dir, day, slug) {
    function attempt(n) {
      var path = dir + "/" + day + "-" + slug + (n > 1 ? "-" + n : "") + ".md";
      return fileExists(path).then(function (exists) {
        return exists ? attempt(n + 1) : path;
      });
    }
    return attempt(1);
  }
  function fileDay(path) {
    var m = /(\d{4}-\d{2}-\d{2})-/.exec(path);
    return m ? m[1] : "";
  }
  function viewUrl(kind, path) {
    var name = path.split("/").pop().replace(/\.[^.]+$/, "");
    if (kind === "posts") {
      var m = /^(\d{4})-\d{2}-\d{2}-(.+)$/.exec(name);
      return m ? "/blog/" + m[1] + "/" + m[2] + "/" : "/blog/";
    }
    return "/news/" + name + "/";
  }

  /* ------------------------------------------------------------------ *
   * Small Markdown preview (escapes HTML first; links limited to safe schemes)
   * ------------------------------------------------------------------ */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function safeUrl(u) {
    u = String(u || "").trim();
    return /^(https?:|mailto:|\/|#)/i.test(u) ? u : "#";
  }
  function inlineMd(s) {
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, function (m, alt, src) {
        return '<img alt="' + alt + '" src="' + safeUrl(src) + '" style="max-width:100%">';
      })
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, function (m, label, href) {
        return '<a href="' + safeUrl(href) + '" target="_blank" rel="noopener">' + label + "</a>";
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, "$1<em>$2</em>");
  }
  function renderMd(md) {
    var blocks = esc(md).replace(/\r/g, "").split(/\n{2,}/);
    return blocks
      .map(function (b) {
        var h = /^(#{1,4})\s+(.*)$/.exec(b);
        if (h) return "<h" + (h[1].length + 2) + ">" + inlineMd(h[2]) + "</h" + (h[1].length + 2) + ">";
        if (/^\s*[-*]\s+/.test(b)) {
          return (
            "<ul>" +
            b
              .split(/\n/)
              .map(function (l) {
                return "<li>" + inlineMd(l.replace(/^\s*[-*]\s+/, "")) + "</li>";
              })
              .join("") +
            "</ul>"
          );
        }
        if (/^&gt;\s?/.test(b)) return "<blockquote>" + inlineMd(b.replace(/^&gt;\s?/gm, "")) + "</blockquote>";
        return "<p>" + inlineMd(b).replace(/\n/g, "<br>") + "</p>";
      })
      .join("");
  }

  /* ------------------------------------------------------------------ *
   * DOM helpers and styles
   * ------------------------------------------------------------------ */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  var CSS = [
    ".se-bar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:.25rem 0 1.25rem}",
    ".se-btn{display:inline-flex;align-items:center;gap:.35rem;padding:.38rem .85rem;border-radius:6px;border:1px solid var(--global-divider-color);background:var(--global-bg-color);color:var(--global-text-color);font-size:.88rem;line-height:1.3;cursor:pointer;text-decoration:none}",
    ".se-btn:hover{border-color:var(--global-theme-color);color:var(--global-theme-color);text-decoration:none}",
    ".se-btn.se-primary{background:var(--global-theme-color);border-color:var(--global-theme-color);color:#fff}",
    ".se-btn.se-primary:hover{opacity:.9;color:#fff}",
    ".se-btn.se-danger{color:#c0392b;border-color:#e6b0aa}",
    ".se-btn.se-danger:hover{background:#c0392b;color:#fff;border-color:#c0392b}",
    ".se-btn[disabled]{opacity:.55;cursor:default}",
    ".se-note{font-size:.85rem;color:var(--global-text-color-light)}",
    ".se-overlay{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:4vh 1rem}",
    ".se-modal{width:100%;max-width:46rem;background:var(--global-bg-color);color:var(--global-text-color);border:1px solid var(--global-divider-color);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.25);padding:1.25rem 1.4rem}",
    ".se-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem}",
    ".se-head h2{font-size:1.25rem;margin:0}",
    ".se-x{background:none;border:0;font-size:1.6rem;line-height:1;color:var(--global-text-color);cursor:pointer;padding:0 .25rem}",
    ".se-field{margin-bottom:.9rem}",
    ".se-field label{display:block;font-weight:600;font-size:.9rem;margin-bottom:.3rem}",
    ".se-field input[type=text],.se-field input[type=date],.se-field input[type=password],.se-field textarea{width:100%;padding:.5rem .65rem;border:1px solid var(--global-divider-color);border-radius:6px;background:var(--global-bg-color);color:var(--global-text-color);font-size:.95rem;font-family:inherit}",
    ".se-field textarea{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88rem;line-height:1.45}",
    ".se-help{font-size:.8rem;color:var(--global-text-color-light);margin-top:.25rem}",
    ".se-row{display:flex;gap:.9rem;flex-wrap:wrap}.se-row>.se-field{flex:1 1 12rem}",
    ".se-preview{border:1px dashed var(--global-divider-color);border-radius:6px;padding:.6rem .8rem;font-size:.95rem;min-height:2.5rem}",
    ".se-preview p:last-child{margin-bottom:0}",
    ".se-actions{display:flex;gap:.5rem;align-items:center;margin-top:1rem}.se-actions .se-spacer{flex:1}",
    ".se-status{margin-top:.75rem;font-size:.9rem;min-height:1.2rem}",
    ".se-status.se-err{color:#c0392b}.se-status.se-ok{color:var(--global-theme-color)}",
    ".se-toast{position:fixed;left:1rem;bottom:1rem;z-index:2100;max-width:24rem;background:var(--global-bg-color);color:var(--global-text-color);border:1px solid var(--global-divider-color);border-left:4px solid var(--global-theme-color);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:.75rem .9rem;font-size:.9rem}",
    ".se-toast a{color:var(--global-theme-color)}",
    ".se-toast .se-x{float:right;font-size:1.2rem;margin-left:.5rem}",
    ".se-admin h3{margin-top:1.75rem}",
    ".se-list{list-style:none;padding:0;margin:.5rem 0 0}",
    ".se-list li{display:flex;gap:.75rem;align-items:baseline;padding:.55rem 0;border-bottom:1px solid var(--global-divider-color)}",
    ".se-list .se-date{flex:0 0 6.5rem;font-weight:600;font-size:.88rem}",
    ".se-list .se-text{flex:1;font-size:.92rem;overflow:hidden}",
    ".se-list .se-ops{flex:0 0 auto;display:flex;gap:.35rem}",
    ".se-list .se-ops .se-btn{padding:.2rem .55rem;font-size:.8rem}",
    ".se-card{border:1px solid var(--global-divider-color);border-radius:10px;padding:1rem 1.2rem;margin:1rem 0}",
    ".se-steps{padding-left:1.2rem;font-size:.92rem}.se-steps li{margin-bottom:.35rem}",
    ".se-check{display:flex;gap:.45rem;align-items:center;font-size:.9rem}",
  ].join("\n");

  function ensureStyles() {
    if (document.getElementById("se-styles")) return;
    document.head.appendChild(el("style", { id: "se-styles", text: CSS }));
  }

  /* ------------------------------------------------------------------ *
   * Publishing status
   * ------------------------------------------------------------------ */
  var toastNode = null;
  function toast(html, keep) {
    ensureStyles();
    if (toastNode) toastNode.remove();
    toastNode = el("div", { class: "se-toast", role: "status", "aria-live": "polite" }, [
      el("button", {
        class: "se-x",
        "aria-label": "Close",
        text: "×",
        onclick: function () {
          if (toastNode) toastNode.remove();
          toastNode = null;
        },
      }),
      el("div", { html: html }),
    ]);
    document.body.appendChild(toastNode);
    if (!keep) {
      var node = toastNode;
      setTimeout(function () {
        if (node === toastNode && node) {
          node.remove();
          toastNode = null;
        }
      }, 12000);
    }
  }

  /* Follows the build for one commit: the "Deploy site" workflow, then the
     GitHub Pages publish run it triggers. Reports through onState. */
  function watchDeploy(sha, onState) {
    var started = Date.now();
    var builtAt = null;
    var errors = 0;
    function runs(branch) {
      return gh("GET", "/repos/" + REPO + "/actions/runs?per_page=15&branch=" + encodeURIComponent(branch)).then(function (d) {
        return (d && d.workflow_runs) || [];
      });
    }
    function later() {
      setTimeout(poll, 8000);
    }
    function poll() {
      if (Date.now() - started > 12 * 60 * 1000) return onState("slow");
      var step = builtAt
        ? runs("gh-pages").then(function (list) {
            var pub = list.filter(function (r) {
              return new Date(r.created_at).getTime() >= builtAt - 90 * 1000;
            })[0];
            if (!pub) {
              if (Date.now() - builtAt > 3 * 60 * 1000) return onState("live");
              onState("publishing");
              return later();
            }
            if (pub.status !== "completed") {
              onState("publishing");
              return later();
            }
            onState(pub.conclusion === "success" ? "live" : "failed", pub.html_url);
          })
        : runs(BRANCH).then(function (list) {
            var run = list.filter(function (r) {
              return r.head_sha === sha && (/\/deploy\.yml$/.test(r.path || "") || r.name === "Deploy site");
            })[0];
            if (!run) {
              onState("queued");
              return later();
            }
            if (run.status !== "completed") {
              onState("building");
              return later();
            }
            if (run.conclusion !== "success") return onState("failed", run.html_url);
            builtAt = new Date(run.updated_at).getTime();
            onState("publishing");
            later();
          });
      step.catch(function () {
        errors += 1;
        if (errors >= 4) return onState("unknown");
        later();
      });
    }
    poll();
  }

  function announce(verb, kind, commit) {
    var what = NOUN[kind];
    var actions = "https://github.com/" + REPO + "/actions";
    var text = {
      queued: "Saved. Waiting for the site build to start…",
      building: "Saved. Rebuilding the site…",
      publishing: "Built. Publishing to shanjiang.info…",
      live: "Live now. Reload the page to see the change.",
      failed: 'The site build failed. <a href="' + actions + '" target="_blank" rel="noopener">See what went wrong</a>.',
      slow: 'Still building after 12 minutes. <a href="' + actions + '" target="_blank" rel="noopener">Check the build</a>.',
      unknown: "Saved. The site usually updates within 2–4 minutes.",
    };
    toast("<strong>" + esc(what.charAt(0).toUpperCase() + what.slice(1) + " " + verb) + ".</strong><br>" + text.queued, true);
    if (!commit || !commit.sha) return;
    watchDeploy(commit.sha, function (state, url) {
      var msg = text[state] || text.unknown;
      if (state === "failed" && url) msg = 'The site build failed. <a href="' + url + '" target="_blank" rel="noopener">See what went wrong</a>.';
      toast("<strong>" + esc(what.charAt(0).toUpperCase() + what.slice(1) + " " + verb) + ".</strong><br>" + msg, state !== "live");
    });
  }

  /* ------------------------------------------------------------------ *
   * Editor dialog
   * ------------------------------------------------------------------ */
  function field(label, input, help) {
    return el("div", { class: "se-field" }, [el("label", { text: label, for: input.id }), input, help ? el("div", { class: "se-help", html: help }) : null]);
  }

  /* opts: { kind: "news"|"posts", path?: string } — path set means edit. */
  function openEditor(opts) {
    ensureStyles();
    var kind = opts.kind;
    var editing = !!opts.path;
    var original = null;
    var lastFocus = document.activeElement;

    var title = el("h2", { id: "se-dialog-title", text: (editing ? "Edit " : "Add ") + NOUN[kind] });
    var status = el("div", { class: "se-status" });
    var form = el("form", { class: "se-form", novalidate: true });
    var overlay = el("div", { class: "se-overlay", role: "dialog", "aria-modal": "true", "aria-labelledby": "se-dialog-title" }, [
      el("div", { class: "se-modal" }, [el("div", { class: "se-head" }, [title, el("button", { class: "se-x", type: "button", "aria-label": "Close", text: "×", onclick: close })]), form, status]),
    ]);

    var inp = {
      date: el("input", { type: "date", id: "se-date", value: isoDay(new Date()), required: true }),
      title: el("input", { type: "text", id: "se-title", maxlength: "200" }),
      text: el("textarea", { id: "se-text", rows: kind === "news" ? "5" : "16" }),
      description: el("input", { type: "text", id: "se-description", maxlength: "300" }),
      tags: el("input", { type: "text", id: "se-tags" }),
      categories: el("input", { type: "text", id: "se-categories" }),
    };
    var preview = el("div", { class: "se-preview", "aria-live": "polite" });
    function refreshPreview() {
      preview.innerHTML = inp.text.value.trim() ? renderMd(inp.text.value) : '<span class="se-note">The preview appears here.</span>';
    }
    inp.text.addEventListener("input", refreshPreview);

    if (kind === "news") {
      form.appendChild(el("div", { class: "se-row" }, [field("Date", inp.date)]));
      form.appendChild(
        field(
          "Text",
          inp.text,
          "One or two sentences. Markdown works: <code>**bold**</code>, <code>*italic*</code>, <code>[link text](https://…)</code>.",
        ),
      );
      form.appendChild(field("Title (optional)", inp.title, "Only for a longer story that needs its own page. Leave empty for a one-line item."));
    } else {
      form.appendChild(field("Title", inp.title));
      form.appendChild(el("div", { class: "se-row" }, [field("Date", inp.date), field("Short description", inp.description, "Shown under the title in the blog list.")]));
      form.appendChild(
        el("div", { class: "se-row" }, [
          field("Tags", inp.tags, "Separate with spaces, e.g. <code>dcea equity</code>."),
          field("Categories", inp.categories, "Separate with spaces, e.g. <code>research</code>."),
        ]),
      );
      form.appendChild(
        field(
          "Post",
          inp.text,
          "Markdown: <code>## Heading</code>, <code>**bold**</code>, <code>*italic*</code>, <code>[link](https://…)</code>, <code>- list item</code>, and blank lines between paragraphs.",
        ),
      );
    }
    form.appendChild(el("div", { class: "se-field" }, [el("label", { text: "Preview" }), preview]));

    var saveBtn = el("button", { type: "submit", class: "se-btn se-primary", text: editing ? "Save changes" : "Publish" });
    var cancelBtn = el("button", { type: "button", class: "se-btn", text: "Cancel", onclick: close });
    var deleteBtn = editing ? el("button", { type: "button", class: "se-btn se-danger", text: "Delete", onclick: onDelete }) : null;
    form.appendChild(el("div", { class: "se-actions" }, [deleteBtn, el("span", { class: "se-spacer" }), cancelBtn, saveBtn]));
    form.addEventListener("submit", onSave);

    function onKey(e) {
      if (e.key === "Escape") close();
    }
    function close() {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      document.body.style.overflow = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function busy(on, msg) {
      [saveBtn, cancelBtn, deleteBtn].forEach(function (b) {
        if (b) b.disabled = on;
      });
      setStatus(msg || "", "");
    }
    function setStatus(msg, cls) {
      status.className = "se-status" + (cls ? " " + cls : "");
      status.textContent = msg;
    }

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    refreshPreview();

    if (editing) {
      busy(true, "Loading…");
      readFile(opts.path).then(
        function (file) {
          original = file;
          var doc = parseDoc(file.text);
          inp.date.value = dayOf(fmGet(doc, "date")) || fileDay(file.path) || isoDay(new Date());
          inp.title.value = fmGet(doc, "title");
          inp.text.value = doc.body.trim();
          inp.description.value = fmGet(doc, "description");
          inp.tags.value = fmGet(doc, "tags");
          inp.categories.value = fmGet(doc, "categories");
          refreshPreview();
          busy(false);
          (kind === "news" ? inp.text : inp.title).focus();
        },
        function (err) {
          busy(false);
          saveBtn.disabled = true;
          setStatus("Could not load the file. " + err.message, "se-err");
        },
      );
    } else {
      setTimeout(function () {
        (kind === "news" ? inp.text : inp.title).focus();
      }, 30);
    }

    function onSave(e) {
      e.preventDefault();
      var day = inp.date.value;
      var text = inp.text.value.replace(/\s+$/, "");
      var ttl = inp.title.value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return setStatus("Please pick a date.", "se-err");
      if (kind === "posts" && !ttl) return setStatus("Please give the post a title.", "se-err");
      if (!text.trim()) return setStatus(kind === "news" ? "Please write the news text." : "Please write the post.", "se-err");
      if (isFuture(day) && !window.confirm("This date is in the future. The site only shows it after that date, at the next rebuild. Save anyway?")) return;

      var doc;
      if (editing) {
        doc = parseDoc(original.text);
        if (dayOf(fmGet(doc, "date")) !== day) fmSet(doc, "date", stampForDay(day));
      } else {
        doc = { fm: [], body: "" };
        fmSet(doc, "layout", "post");
        if (kind === "posts" || ttl) fmSet(doc, "title", quote(ttl));
        fmSet(doc, "date", stampForDay(day));
      }
      if (kind === "news") {
        fmSet(doc, "title", ttl ? quote(ttl) : null);
        fmSet(doc, "inline", ttl ? "false" : "true");
        if (!editing) fmSet(doc, "related_posts", "false");
      } else {
        fmSet(doc, "title", quote(ttl));
        var desc = inp.description.value.trim();
        fmSet(doc, "description", desc ? quote(desc) : null);
        var tags = inp.tags.value.trim().replace(/[,\s]+/g, " ");
        var cats = inp.categories.value.trim().replace(/[,\s]+/g, " ");
        fmSet(doc, "tags", tags || null);
        fmSet(doc, "categories", cats || null);
      }
      doc.body = text;
      var content = serialise(doc);

      busy(true, "Saving to GitHub…");
      var label = kind === "news" ? plainText(ttl || text).slice(0, 60) : ttl.slice(0, 60);
      var job = editing
        ? writeFile(original.path, content, "Update " + NOUN[kind] + ": " + label + " (site editor)", original.sha)
        : uniquePath(DIRS[kind], day, slugify(ttl || text, kind === "news" ? "news" : "post")).then(function (path) {
            return writeFile(path, content, "Add " + NOUN[kind] + ": " + label + " (site editor)");
          });
      job.then(
        function (res) {
          close();
          announce(editing ? "saved" : "published", kind, res && res.commit);
          if (typeof opts.onDone === "function") opts.onDone();
        },
        function (err) {
          busy(false);
          setStatus(err.message, "se-err");
        },
      );
    }

    function onDelete() {
      if (!original) return;
      if (!window.confirm("Delete this " + NOUN[kind] + " from the site? You can still recover it from the repository history on GitHub.")) return;
      busy(true, "Deleting…");
      removeFile(original.path, original.sha, "Delete " + NOUN[kind] + ": " + original.path.split("/").pop() + " (site editor)").then(
        function (res) {
          close();
          announce("deleted", kind, res && res.commit);
          if (typeof opts.onDone === "function") opts.onDone();
        },
        function (err) {
          busy(false);
          setStatus(err.message, "se-err");
        },
      );
    }
  }

  /* ------------------------------------------------------------------ *
   * Toolbars on the public pages (only when signed in)
   * ------------------------------------------------------------------ */
  function placeBar(bar) {
    var slot = document.getElementById("site-editor-toolbar");
    if (slot) {
      slot.innerHTML = "";
      slot.appendChild(bar);
      return;
    }
    var header = document.querySelector(".post .post-header") || document.querySelector(".post .header-bar");
    if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
    else {
      var post = document.querySelector(".post");
      if (post) post.insertBefore(bar, post.firstChild);
    }
  }

  function signOutButton() {
    return el("button", {
      type: "button",
      class: "se-btn",
      text: "Sign out",
      title: "Remove the GitHub token from this browser",
      onclick: function () {
        clearToken();
        window.location.reload();
      },
    });
  }

  function listToolbar(kind) {
    ensureStyles();
    placeBar(
      el("div", { class: "se-bar", role: "toolbar", "aria-label": "Site editor" }, [
        el("button", {
          type: "button",
          class: "se-btn se-primary",
          html: "<span aria-hidden='true'>＋</span> " + (kind === "news" ? "Add news" : "New blog post"),
          onclick: function () {
            openEditor({ kind: kind });
          },
        }),
        el("a", { class: "se-btn", href: ADMIN_URL, text: kind === "news" ? "Edit or delete news" : "Edit or delete posts" }),
        signOutButton(),
      ]),
    );
  }

  function itemToolbar(kind, path) {
    ensureStyles();
    placeBar(
      el("div", { class: "se-bar", role: "toolbar", "aria-label": "Site editor" }, [
        el("button", {
          type: "button",
          class: "se-btn se-primary",
          text: "Edit this " + NOUN[kind],
          onclick: function () {
            openEditor({ kind: kind, path: path });
          },
        }),
        el("a", { class: "se-btn", href: ADMIN_URL, text: "Site editor" }),
      ]),
    );
  }

  /* ------------------------------------------------------------------ *
   * Admin page (/admin/)
   * ------------------------------------------------------------------ */
  function tokenLink() {
    var owner = REPO.split("/")[0];
    var q = [
      "name=" + encodeURIComponent("shanjiang.info site editor"),
      "description=" + encodeURIComponent("Lets the website add and edit news and blog posts in " + REPO),
      "target_name=" + encodeURIComponent(owner),
      "expires_in=366",
      "contents=write",
    ].join("&");
    return "https://github.com/settings/personal-access-tokens/new?" + q;
  }

  function adminSignIn(root) {
    var tokenInput = el("input", { type: "password", id: "se-token", autocomplete: "off", spellcheck: "false", placeholder: "github_pat_…" });
    var remember = el("input", { type: "checkbox", id: "se-remember", checked: true });
    var status = el("div", { class: "se-status" });
    var btn = el("button", { type: "submit", class: "se-btn se-primary", text: "Sign in" });
    var form = el("form", { class: "se-card" }, [
      el("p", {
        html: "Sign in once on this browser to add, edit and delete news and blog posts. You need a GitHub token that can write to <code>" + esc(REPO) + "</code>.",
      }),
      el("ol", { class: "se-steps" }, [
        el("li", {
          html:
            'Open <a href="' + tokenLink() + '" target="_blank" rel="noopener">GitHub’s new-token page</a> (the name, expiry and the Contents permission are filled in).',
        }),
        el("li", { html: "Under <strong>Repository access</strong>, choose <strong>Only select repositories</strong> and pick <code>" + esc(REPO) + "</code>." }),
        el("li", { html: "Check that <strong>Contents</strong> says <strong>Read and write</strong>, then click <strong>Generate token</strong>." }),
        el("li", { html: "Copy the token and paste it below. It stays in this browser only and is never put on the website." }),
      ]),
      field("GitHub token", tokenInput),
      el("label", { class: "se-check", for: "se-remember" }, [remember, "Remember me on this device (leave unticked on a shared computer)"]),
      el("div", { class: "se-actions" }, [btn]),
      status,
    ]);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var token = tokenInput.value.trim();
      if (!token) {
        status.className = "se-status se-err";
        status.textContent = "Paste the token first.";
        return;
      }
      btn.disabled = true;
      status.className = "se-status";
      status.textContent = "Checking the token with GitHub…";
      Promise.all([gh("GET", "/user", null, token), gh("GET", "/repos/" + REPO, null, token)]).then(
        function (res) {
          var user = res[0] || {};
          var repo = res[1] || {};
          if (repo.permissions && repo.permissions.push === false) {
            throw new Error("This token cannot write to " + REPO + ". Give it access to this repository with Contents set to 'Read and write'.");
          }
          saveToken(token, user.login || "", remember.checked);
          tokenInput.value = "";
          renderAdmin(root);
        },
        function (err) {
          throw err;
        },
      ).catch(function (err) {
        btn.disabled = false;
        status.className = "se-status se-err";
        status.textContent = err.message;
      });
    });
    root.innerHTML = "";
    root.appendChild(form);
    tokenInput.focus();
  }

  function adminSection(root, kind) {
    var list = el("ul", { class: "se-list" }, [el("li", { class: "se-note", text: "Loading…" })]);
    var heading = el("h3", { text: kind === "news" ? "News" : "Blog posts" });
    var bar = el("div", { class: "se-bar" }, [
      el("button", {
        type: "button",
        class: "se-btn se-primary",
        html: "<span aria-hidden='true'>＋</span> " + (kind === "news" ? "Add news" : "New blog post"),
        onclick: function () {
          openEditor({ kind: kind, onDone: reloadSoon });
        },
      }),
      el("a", { class: "se-btn", href: kind === "news" ? "/news/" : "/blog/", text: kind === "news" ? "View the news page" : "View the blog" }),
    ]);
    root.appendChild(heading);
    root.appendChild(bar);
    root.appendChild(list);

    function reloadSoon() {
      setTimeout(load, 1500);
    }
    function load() {
      listDir(DIRS[kind])
        .then(function (files) {
          files.sort(function (a, b) {
            return a.name < b.name ? 1 : -1;
          });
          if (!files.length) {
            list.innerHTML = "";
            list.appendChild(el("li", { class: "se-note", text: "Nothing here yet." }));
            return;
          }
          return mapLimit(files, 6, function (f) {
            return readFile(f.path).then(
              function (file) {
                var doc = parseDoc(file.text);
                return { path: f.path, date: dayOf(fmGet(doc, "date")) || fileDay(f.path), title: fmGet(doc, "title"), body: doc.body };
              },
              function () {
                return { path: f.path, date: fileDay(f.path), title: "", body: "" };
              },
            );
          }).then(function (items) {
            items.sort(function (a, b) {
              return a.date === b.date ? (a.path < b.path ? 1 : -1) : a.date < b.date ? 1 : -1;
            });
            list.innerHTML = "";
            items.forEach(function (it) {
              var summary = it.title || plainText(it.body);
              list.appendChild(
                el("li", null, [
                  el("span", { class: "se-date", text: it.date }),
                  el("span", { class: "se-text", text: summary.length > 160 ? summary.slice(0, 157) + "…" : summary }),
                  el("span", { class: "se-ops" }, [
                    el("button", {
                      type: "button",
                      class: "se-btn",
                      text: "Edit",
                      onclick: function () {
                        openEditor({ kind: kind, path: it.path, onDone: reloadSoon });
                      },
                    }),
                    el("a", { class: "se-btn", href: viewUrl(kind, it.path), text: "View" }),
                  ]),
                ]),
              );
            });
          });
        })
        .catch(function (err) {
          list.innerHTML = "";
          list.appendChild(el("li", { class: "se-status se-err", text: "Could not load the list. " + err.message }));
        });
    }
    load();
  }

  function mapLimit(items, limit, fn) {
    var results = new Array(items.length);
    var next = 0;
    function worker() {
      if (next >= items.length) return Promise.resolve();
      var i = next++;
      return fn(items[i]).then(function (r) {
        results[i] = r;
        return worker();
      });
    }
    var workers = [];
    for (var w = 0; w < Math.min(limit, items.length); w++) workers.push(worker());
    return Promise.all(workers).then(function () {
      return results;
    });
  }

  function renderAdmin(root) {
    ensureStyles();
    root.className = "se-admin";
    if (!getToken()) return adminSignIn(root);
    root.innerHTML = "";
    var login = getLogin();
    root.appendChild(
      el("div", { class: "se-bar" }, [
        el("span", { class: "se-note", html: "Signed in" + (login ? " as <strong>" + esc(login) + "</strong>" : "") + " on this browser." }),
        signOutButton(),
      ]),
    );
    root.appendChild(
      el("p", {
        class: "se-note",
        text: "Changes are saved to GitHub and go live after the site rebuilds, usually within 2–4 minutes. A status note appears in the bottom-left corner while that happens.",
      }),
    );
    adminSection(root, "news");
    adminSection(root, "posts");
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */
  function start() {
    var adminRoot = document.getElementById("site-editor-admin");
    if (adminRoot) return renderAdmin(adminRoot);
    if (!getToken()) return;
    var kind = PAGE.kind === "news" || PAGE.kind === "posts" ? PAGE.kind : null;
    if (!kind) return;
    var path = String(PAGE.path || "");
    if (path.indexOf(DIRS[kind] + "/") === 0) itemToolbar(kind, path);
    else listToolbar(kind);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
