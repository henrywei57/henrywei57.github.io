(function () {
  "use strict";

  /* ---------- Theme toggle ---------- */

  var root = document.documentElement;
  var toggle = document.querySelector(".theme-toggle");
  var systemDark = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

  function savedTheme() {
    try {
      var value = localStorage.getItem("theme");
      return value === "light" || value === "dark" ? value : null;
    } catch (e) {
      return null;
    }
  }

  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set === "light" || set === "dark") return set;
    return systemDark && systemDark.matches ? "dark" : "light";
  }

  function updateToggle() {
    if (!toggle) return;
    var dark = currentTheme() === "dark";
    toggle.classList.toggle("is-dark", dark);
    toggle.setAttribute(
      "aria-label",
      dark ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
      updateToggle();
    });
  }

  if (systemDark) {
    var onSystemChange = function () {
      if (!savedTheme()) updateToggle();
    };
    if (systemDark.addEventListener) {
      systemDark.addEventListener("change", onSystemChange);
    } else if (systemDark.addListener) {
      systemDark.addListener(onSystemChange);
    }
  }

  updateToggle();

  /* ---------- Footer year ---------- */

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Projects ---------- */

  var STATUS_LABELS = {
    finished: "Finished",
    ongoing: "Ongoing",
    paused: "Paused"
  };

  var grid = document.getElementById("project-grid");
  var filterBar = document.querySelector(".filters");
  var countEl = document.querySelector(".count");
  var projects = (window.PROJECTS || []).filter(function (p) {
    return p && p.name && p.description;
  });

  if (!grid) return;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function linkButton(href, label, projectName, style) {
    var a = el("a", "btn " + style);
    a.href = href;
    a.appendChild(document.createTextNode(label));
    // Screen readers hear "Live demo of Full Count", not just "Live demo".
    a.appendChild(el("span", "sr-only", " of " + projectName));
    return a;
  }

  function buildCard(p) {
    var card = el("article", "card");
    card.setAttribute("data-category", p.category || "");

    var top = el("div", "card-top");
    top.appendChild(el("span", "card-category", p.category || ""));
    var status = String(p.status || "").toLowerCase();
    if (STATUS_LABELS[status]) {
      var pill = el("span", "status status-" + status, STATUS_LABELS[status]);
      top.appendChild(pill);
    }
    card.appendChild(top);

    card.appendChild(el("h3", null, p.name));
    if (p.byHand) card.appendChild(el("span", "badge", "Written by me"));
    card.appendChild(el("p", "card-desc", p.description));

    if (Array.isArray(p.tech) && p.tech.length) {
      var tags = el("ul", "tags");
      tags.setAttribute("aria-label", "Built with");
      p.tech.forEach(function (t) {
        tags.appendChild(el("li", null, t));
      });
      card.appendChild(tags);
    }

    var links = el("div", "card-links");
    if (p.demo) links.appendChild(linkButton(p.demo, "Live demo", p.name, "btn-primary"));
    if (p.repo) links.appendChild(linkButton(p.repo, p.repoLabel || "Code", p.name, "btn-secondary"));
    if (!p.demo && !p.repo) links.appendChild(el("span", "no-link", "No public link yet"));
    card.appendChild(links);

    if (Array.isArray(p.links) && p.links.length) {
      var extra = el("div", "card-extra");
      extra.appendChild(el("span", null, "More:"));
      var list = el("ul");
      p.links.forEach(function (l) {
        if (!l || !l.url) return;
        var li = el("li");
        var a = el("a", null, l.label || l.url);
        a.href = l.url;
        li.appendChild(a);
        list.appendChild(li);
      });
      extra.appendChild(list);
      card.appendChild(extra);
    }

    return card;
  }

  var cards = projects.map(function (p) {
    var card = buildCard(p);
    grid.appendChild(card);
    return card;
  });

  // Categories in the order they first appear in projects.js.
  var categories = [];
  projects.forEach(function (p) {
    if (p.category && categories.indexOf(p.category) === -1) categories.push(p.category);
  });

  function countIn(category) {
    if (category === "All") return projects.length;
    return projects.filter(function (p) {
      return p.category === category;
    }).length;
  }

  function showCount(shown) {
    if (!countEl) return;
    countEl.textContent =
      shown === projects.length
        ? projects.length + " projects"
        : "Showing " + shown + " of " + projects.length;
  }

  function applyFilter(category) {
    var shown = 0;
    cards.forEach(function (card, i) {
      var match = category === "All" || projects[i].category === category;
      card.hidden = !match;
      if (match) shown++;
    });
    if (filterBar) {
      Array.prototype.forEach.call(filterBar.children, function (btn) {
        btn.setAttribute("aria-pressed", String(btn.getAttribute("data-category") === category));
      });
    }
    showCount(shown);
  }

  if (filterBar && categories.length > 1) {
    ["All"].concat(categories).forEach(function (category) {
      var btn = el("button", "filter");
      btn.type = "button";
      btn.setAttribute("data-category", category);
      btn.setAttribute("aria-pressed", "false");
      btn.appendChild(document.createTextNode(category));
      var n = el("span", "filter-count", String(countIn(category)));
      n.setAttribute("aria-hidden", "true");
      btn.appendChild(n);
      btn.addEventListener("click", function () {
        applyFilter(category);
      });
      filterBar.appendChild(btn);
    });
  }

  applyFilter("All");

  /* ---------- Scroll reveal ---------- */

  var motion = root.classList.contains("motion");

  if (motion && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    var targets = document.querySelectorAll(
      ".section .section-num, .section h2, .section-intro, .step, .section .note, .toolbar, .links-card"
    );
    Array.prototype.forEach.call(targets, function (node) {
      node.classList.add("reveal");
      io.observe(node);
    });

    Array.prototype.forEach.call(document.querySelectorAll(".step"), function (node, n) {
      node.style.setProperty("--d", n * 90 + "ms");
    });

    cards.forEach(function (card, n) {
      card.classList.add("reveal");
      card.style.setProperty("--d", (n % 3) * 80 + "ms");
      io.observe(card);
    });
  }

  /* ---------- Card glow that follows the mouse ---------- */

  var litCard = null;

  function unlight() {
    if (!litCard) return;
    litCard.style.removeProperty("--mx");
    litCard.style.removeProperty("--my");
    litCard = null;
  }

  grid.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    var card = e.target.closest(".card");
    if (card !== litCard) unlight();
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty("--mx", e.clientX - r.left + "px");
    card.style.setProperty("--my", e.clientY - r.top + "px");
    litCard = card;
  });
  grid.addEventListener("pointerleave", unlight);
})();
