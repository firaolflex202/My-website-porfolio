import { WaterSurface } from "./water.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("water");
const homeCanvas = document.getElementById("water-home");
const splash = document.getElementById("splash");
const home = document.getElementById("home");
const surface = canvas ? new WaterSurface(canvas, { reducedMotion }) : null;
const homeSurface = homeCanvas
  ? new WaterSurface(homeCanvas, {
      reducedMotion,
      host: home || homeCanvas.parentElement,
    })
  : null;
if (surface) surface.start();

if (surface) document.documentElement.dataset.water = surface.mode;

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

function entered() {
  return document.body.classList.contains("is-entered");
}

function enterHome() {
  if (entered()) return;
  document.body.classList.remove("is-splash");
  document.body.classList.add("is-entered");
  const main = document.querySelector("main");
  if (main) main.removeAttribute("aria-hidden");
  if (splash) splash.tabIndex = -1;
  if (homeSurface) homeSurface.start();
  const stop = () => {
    if (surface) surface.stop();
    if (splash) splash.setAttribute("aria-hidden", "true");
  };
  if (reducedMotion || !splash) stop();
  else splash.addEventListener("transitionend", stop, { once: true });
}

function showSplash(event) {
  if (event) event.preventDefault();
  document.body.classList.add("is-splash");
  document.body.classList.remove("is-entered");
  const main = document.querySelector("main");
  if (main) main.setAttribute("aria-hidden", "true");
  if (splash) {
    splash.removeAttribute("aria-hidden");
    splash.tabIndex = 0;
    splash.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  history.replaceState(null, "", window.location.pathname || "index.html");
  if (homeSurface) homeSurface.stop();
  if (surface) surface.start();
}

if (splash) {
  splash.addEventListener("click", enterHome);
  splash.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      enterHome();
    }
  });
}

const skip = document.querySelector(".skip");
if (skip) skip.addEventListener("click", enterHome);

const back = document.getElementById("back-to-surface");
if (back) back.addEventListener("click", showSplash);

if (window.location.hash && window.location.hash !== "#splash" && window.location.hash !== "#top") {
  enterHome();
}

const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("site-nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      enterHome();
    });
  });
}

const sections = [...document.querySelectorAll("main section[id]")];
const navLinks = [...document.querySelectorAll(".nav a")];

const spy = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      navLinks.forEach((link) => {
        const href = link.getAttribute("href") || "";
        link.classList.toggle("is-active", href.endsWith(`#${id}`));
      });
    });
  },
  { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
);

sections.forEach((section) => spy.observe(section));

const reveals = document.querySelectorAll(".reveal");
if (reducedMotion) {
  reveals.forEach((el) => el.classList.add("is-visible"));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
  );
  reveals.forEach((el) => io.observe(el));
}

document.querySelectorAll(".preview-link").forEach((link) => {
  const show = () => link.classList.add("is-hot");
  const hide = () => link.classList.remove("is-hot");
  link.addEventListener("pointerenter", show);
  link.addEventListener("pointerleave", hide);
  link.addEventListener("focus", show);
  link.addEventListener("blur", hide);
});

const shuffle = document.querySelector("[data-contact-shuffle]");
if (shuffle) {
  const track = shuffle.querySelector(".contact-track");
  const orbs = [...shuffle.querySelectorAll(".contact-orb")];
  const prev = shuffle.querySelector(".contact-arrow-prev");
  const next = shuffle.querySelector(".contact-arrow-next");
  let index = 0;

  const show = (nextIndex) => {
    index = (nextIndex + orbs.length) % orbs.length;
    shuffle.style.setProperty("--contact-i", String(index));
    orbs.forEach((orb, i) => {
      const on = i === index;
      orb.classList.toggle("is-active", on);
      orb.toggleAttribute("aria-hidden", !on);
      orb.tabIndex = on ? 0 : -1;
    });
  };

  if (prev) prev.addEventListener("click", () => show(index - 1));
  if (next) next.addEventListener("click", () => show(index + 1));
  if (track) {
    track.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        show(index - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        show(index + 1);
      }
    });
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (surface) surface.stop();
    if (homeSurface) homeSurface.stop();
    return;
  }
  if (entered()) {
    if (homeSurface) homeSurface.start();
  } else if (surface) {
    surface.start();
  }
});

// made by Nejat Ibrahim Nuru
