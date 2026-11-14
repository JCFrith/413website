/* 413 Solution — shared site behavior */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* ---------- Mobile menu ---------- */
  var toggle = document.querySelector(".menu-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    each(links.querySelectorAll("a"), function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
        toggle.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
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
      progress.style.width = h > 0 ? (y / h) * 100 + "%" : "0%";
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
    var duration = 1400;
    var start = null;
    function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
    function frame(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased) + (p === 1 ? suffix : "");
      if (p < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }
  var counters = document.querySelectorAll("[data-count]");
  if (counters.length) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      each(counters, function (el) {
        el.textContent = parseFloat(el.getAttribute("data-count")).toLocaleString("en-US") + (el.getAttribute("data-suffix") || "");
      });
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
