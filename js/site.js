/* 413 Solution — shared site behavior */
(function () {
  "use strict";

  /* Tells the inline head script that this file loaded, so it keeps the reveal styles on. */
  window.__site413 = true;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* ---------- Mobile menu ---------- */
  var toggle = document.querySelector(".menu-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    var setMenu = function (open) {
      links.classList.toggle("open", open);
      toggle.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    toggle.addEventListener("click", function () {
      setMenu(!links.classList.contains("open"));
    });
    each(links.querySelectorAll("a"), function (a) {
      a.addEventListener("click", function () { setMenu(false); });
    });
    /* Escape closes the menu and hands focus back to the button that opened it */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && links.classList.contains("open")) {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  /* ---------- Nav condense + scroll progress ---------- */
  var nav = document.querySelector("nav.site-nav");
  var progress = document.querySelector(".scroll-progress");
  var reticle = document.querySelector(".hero-reticle");
  var ticking = false;

  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    if (nav) nav.classList.toggle("scrolled", y > 24);
    if (progress) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = "scaleX(" + (h > 0 ? Math.min(y / h, 1) : 0) + ")";
    }
    if (reticle && !reduceMotion) {
      reticle.style.transform = "translateY(calc(-50% + " + y * 0.12 + "px))";
    }
    updateTimeline();
    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });

  /* ---------- Reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    each(revealEls, function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    each(revealEls, function (el) { io.observe(el); });
  }

  /* ---------- Animated counters ---------- */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var suffix = el.getAttribute("data-suffix") || "";
    var duration = 1100;
    var start = null;
    function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
    /* The element keeps its real text the whole time. The moving number is painted
       over it from data-display, so a crawler or screen reader that reads the page
       mid-animation gets the true figure, never "0". */
    el.setAttribute("data-display", "0");
    el.classList.add("counting");
    function frame(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        el.setAttribute("data-display", fmt(target * eased));
        window.requestAnimationFrame(frame);
      } else {
        el.classList.remove("counting");
        el.removeAttribute("data-display");
      }
    }
    window.requestAnimationFrame(frame);
  }
  var counters = document.querySelectorAll("[data-count]");
  if (counters.length) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      /* Static markup already holds the final figures. Nothing to do. */
    } else {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            cio.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });
      each(counters, function (el) { cio.observe(el); });
    }
  }

  /* ---------- Timeline draw (how we deliver) ---------- */
  var timeline = document.querySelector(".timeline");
  function updateTimeline() {
    if (!timeline || reduceMotion) return;
    var rect = timeline.getBoundingClientRect();
    var vh = window.innerHeight;
    var total = rect.height + vh * 0.4;
    var passed = vh * 0.75 - rect.top;
    var p = Math.max(0, Math.min(1, passed / total));
    timeline.style.setProperty("--progress", p.toFixed(3));
  }

  onScroll();
})();
