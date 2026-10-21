// Animierte Live-Präsentation auf Basis der Folien aus praesentation.mjs.
// Bedienung: → / Leertaste / Klick = weiter · ← = zurück · F = Vollbild · O = Übersicht · R = Animation wiederholen
//            B = Schwarzbild · Pos1/Ende = erste/letzte Folie · Zahl + Enter = Folie anspringen · #12 in der URL = Folie 12
(() => {
  const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const buehne = document.getElementById("buehne");
  const folien = [...buehne.querySelectorAll(".folie")];
  const fortschritt = document.getElementById("fortschritt");
  const zaehler = document.getElementById("zaehler");
  let aktuell = -1, ctx = null, uebergang = null, eingabe = "", ruhigTimer = null;

  // ---------- Bühne auf das Fenster skalieren ----------
  function skalieren() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    buehne.style.transformOrigin = "50% 50%";
    buehne.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  addEventListener("resize", skalieren);
  skalieren();

  // ---------- Headlines einmalig in Wörter zerlegen ----------
  function woerter(el) {
    const laufe = (knoten) => {
      for (const k of [...knoten.childNodes]) {
        if (k.nodeType === 3) {
          const teile = k.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          for (const t of teile) {
            if (!t) continue;
            if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); continue; }
            const w = document.createElement("span"); w.className = "w";
            const wi = document.createElement("span"); wi.className = "wi"; wi.textContent = t;
            w.appendChild(wi); frag.appendChild(w);
          }
          k.replaceWith(frag);
        } else if (k.nodeType === 1 && k.tagName !== "BR") laufe(k);
      }
    };
    laufe(el);
  }
  folien.forEach((f) => f.querySelectorAll("h1, h2").forEach(woerter));

  // ---------- Zahlen hochzählen ----------
  const ZAHL = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?/;
  function zaehlen(tl, el, start) {
    const txt = el.dataset.orig ?? (el.dataset.orig = el.textContent);
    if ((txt.match(/\d+(?:[.,]\d+)*/g) || []).length !== 1) return;
    const m = txt.match(ZAHL); if (!m) return;
    const nachkomma = m[2] ? m[2].length : 0;
    const ziel = parseFloat(m[1].replace(/\./g, "") + (m[2] ? "." + m[2] : ""));
    if (!isFinite(ziel) || ziel === 0) return;
    const gruppieren = m[1].includes(".") || (!m[2] && ziel >= 10000);
    const vor = txt.slice(0, m.index), nach = txt.slice(m.index + m[0].length);
    const o = { v: 0 };
    const setze = () => { el.textContent = vor + o.v.toLocaleString("de-DE", { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma, useGrouping: gruppieren }) + nach; };
    tl.fromTo(o, { v: 0 }, { v: ziel, duration: 1.3, ease: "power2.out", immediateRender: false, onUpdate: setze, onComplete: () => { el.textContent = txt; } }, start);
  }

  // ---------- SVG-Diagramme ----------
  function diagramm(tl, svg, t0) {
    const q = (s) => [...svg.querySelectorAll(s)];
    tl.from(q("line, .d-achse"), { opacity: 0, duration: 0.5, stagger: 0.01, ease: "power1.out" }, t0);
    const balken = q("rect").filter((r) => +r.getAttribute("width") > 0);
    if (balken.length) tl.from(balken, { scaleX: 0, transformOrigin: "0% 50%", duration: 0.9, stagger: Math.min(0.06, 0.9 / balken.length), ease: "power3.out" }, t0 + 0.1);
    q("path").forEach((p) => {
      const fuellung = p.getAttribute("fill");
      if (fuellung && fuellung !== "none") { tl.from(p, { opacity: 0, duration: 0.8 }, t0 + 0.9); return; }
      const len = p.getTotalLength ? p.getTotalLength() : 0;
      if (!len) return;
      tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.3, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, t0 + 0.1);
    });
    const kreise = q("circle");
    if (kreise.length) {
      const sortiert = kreise.sort((a, b) => +a.getAttribute("cx") - +b.getAttribute("cx"));
      tl.from(sortiert, { scale: 0, transformOrigin: "50% 50%", duration: 0.45, stagger: Math.min(0.05, 1.1 / kreise.length), ease: "back.out(2.2)" }, t0 + 0.25);
    }
    const labels = q(".d-label, .d-sub");
    if (labels.length) tl.from(labels, { opacity: 0, x: -12, duration: 0.5, stagger: Math.min(0.03, 0.5 / labels.length) }, t0);
    const werte = q(".d-wert, .d-segment");
    if (werte.length) tl.from(werte, { opacity: 0, x: -10, duration: 0.5, stagger: Math.min(0.06, 0.9 / werte.length) }, t0 + 0.45);
    q(".d-wert").forEach((w) => zaehlen(tl, w, t0 + 0.35));
    const notizen = q(".d-notiz, .d-beschriftung");
    if (notizen.length) tl.fromTo(notizen, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.12, ease: "power2.out" }, t0 + 1.2);
  }

  // ---------- Choreografie je Folie ----------
  const BLOCK = [".kachel", ".karte", ".regel", ".fg", ".r10", ".creator-streifen > div", ".diagramm", ".tabelle tbody tr", ".tabelle thead",
    ".merksatz", ".legende", ".randspalte > *", ".lead", ".unterzeile", ".empfehlungen li", ".dd-links", ".dd-hook", ".dd-text > .spalten > div",
    ".d-titel", ".fussnote", ".titel-streifen img"].join(",");
  const HAND = ".hand, .hand-notiz, .notiz";
  const ZAEHLBAR = ".k-wert, .r10-plays, .cs-plays, .sb-zahlen b, .dd-zahlen b";

  function animieren(folie) {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    const kicker = folie.querySelector(".kicker");
    if (kicker) tl.fromTo(kicker, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power2.inOut" }, 0);
    const woerterH = folie.querySelectorAll("h1 .wi, h2 .wi");
    if (woerterH.length) tl.from(woerterH, { yPercent: 110, rotation: 3, duration: 0.85, stagger: 0.045, ease: "expo.out" }, 0.08);

    // Blöcke in Lesereihenfolge; verschachtelte Treffer nur in Steckbriefen einzeln, Diagramme immer separat
    const alle = [...folie.querySelectorAll(BLOCK)];
    const bloecke = alle.filter((el) => !alle.some((a) => a !== el && a.contains(el)));
    const schritt = folie.querySelector(".steckbrief") ? 0.18 : Math.min(0.11, 1.6 / Math.max(1, bloecke.length));
    let t = woerterH.length ? 0.45 : 0.2;
    const zeitVon = (el) => { const i = bloecke.findIndex((b) => b === el || b.contains(el)); return t + Math.max(0, i) * schritt; };
    bloecke.forEach((b, i) => {
      const zeit = t + i * schritt;
      if (b.matches(".diagramm")) return;
      if (b.matches("img")) { tl.from(b, { opacity: 0, y: 70, rotation: i % 2 ? 4 : -4, scale: 0.9, duration: 1, ease: "expo.out" }, zeit); return; }
      if (b.matches(".r10, .creator-streifen > div, .fg")) {
        tl.from(b, { opacity: 0, y: 40, scale: 0.94, duration: 0.8, ease: "expo.out" }, zeit);
      } else if (b.matches(".steckbrief")) {
        tl.from(b, { opacity: 0, y: 50, duration: 0.9, ease: "expo.out" }, zeit);
        tl.from(b, { borderColor: "rgba(98,224,138,.9)", duration: 1.6, ease: "power2.out" }, zeit + 0.1);
        [...b.children].forEach((c, j) => tl.from(c, { opacity: 0, y: 18, duration: 0.6 }, zeit + 0.2 + j * 0.08));
      } else if (b.matches(".kachel, .karte")) {
        tl.from(b, { opacity: 0, y: 36, duration: 0.8 }, zeit);
        tl.from(b, { borderColor: "rgba(98,224,138,.9)", duration: 1.4, ease: "power2.out" }, zeit + 0.1);
      } else if (b.matches(".regel")) {
        tl.from(b, { opacity: 0, y: 30, duration: 0.8 }, zeit);
        tl.fromTo(b, { borderTopColor: "rgba(98,224,138,0)" }, { borderTopColor: getComputedStyle(b).borderTopColor, duration: 0.9 }, zeit);
      } else if (b.matches(".merksatz")) {
        tl.from(b, { opacity: 0, x: -30, duration: 0.9 }, zeit);
      } else if (b.matches(".tabelle tbody tr")) {
        tl.from(b, { opacity: 0, x: -24, duration: 0.55 }, zeit);
      } else {
        tl.from(b, { opacity: 0, y: 24, duration: 0.7 }, zeit);
      }
    });
    folie.querySelectorAll(".diagramm").forEach((svg) => diagramm(tl, svg, zeitVon(svg) + (bloecke.includes(svg) ? 0 : 0.15)));
    folie.querySelectorAll(ZAEHLBAR).forEach((el) => zaehlen(tl, el, zeitVon(el) + 0.1));

    // Kritzel und Handschrift zum Schluss
    const ende = t + bloecke.length * schritt + 0.3;
    folie.querySelectorAll(".kritzel path").forEach((p, i) => {
      const len = p.getTotalLength();
      tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, ende + i * 0.5);
    });
    const hand = folie.querySelectorAll(HAND);
    if (hand.length) tl.fromTo(hand, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 1.2, stagger: 0.25, ease: "power1.inOut" }, ende);
    const fuss = folie.querySelector(".fuss");
    if (fuss) tl.from(fuss, { opacity: 0, duration: 0.8 }, 0.3);
    return tl;
  }

  // ---------- Navigation ----------
  function zeige(n, richtung = 1) {
    n = Math.max(0, Math.min(folien.length - 1, n));
    if (n === aktuell) return;
    const alt = folien[aktuell], neu = folien[n];
    if (uebergang) uebergang.progress(1);
    if (ctx) { ctx.revert(); ctx = null; }
    folien.forEach((f) => f.querySelectorAll("[data-orig]").forEach((el) => (el.textContent = el.dataset.orig)));
    aktuell = n;
    neu.classList.add("aktiv");
    if (ruhig) {
      if (alt) alt.classList.remove("aktiv");
    } else {
      uebergang = gsap.timeline({ onComplete: () => { if (alt && alt !== folien[aktuell]) alt.classList.remove("aktiv"); gsap.set([alt, neu].filter(Boolean), { clearProps: "transform,opacity,filter,zIndex" }); uebergang = null; } });
      if (alt) {
        gsap.set(alt, { zIndex: 1 }); gsap.set(neu, { zIndex: 2 });
        uebergang.to(alt, { opacity: 0, x: -90 * richtung, scale: 0.97, filter: "blur(6px)", duration: 0.5, ease: "power2.in" }, 0);
      }
      uebergang.fromTo(neu, { opacity: 0, x: 90 * richtung, scale: 1.02 }, { opacity: 1, x: 0, scale: 1, duration: 0.7, ease: "power3.out" }, alt ? 0.18 : 0);
      ctx = gsap.context(() => { animieren(neu).delay(alt ? 0.3 : 0.1); }, neu);
    }
    fortschritt.style.width = `${((n + 1) / folien.length) * 100}%`;
    zaehler.textContent = `${String(n + 1).padStart(2, "0")} / ${folien.length}`;
    history.replaceState(null, "", `#${n + 1}`);
    document.querySelectorAll(".ue-karte").forEach((k, i) => k.classList.toggle("aktiv", i === n));
  }
  const weiter = () => zeige(aktuell + 1, 1);
  const zurueck = () => zeige(aktuell - 1, -1);
  function wiederholen() {
    const f = folien[aktuell];
    if (ctx) ctx.revert();
    f.querySelectorAll("[data-orig]").forEach((el) => (el.textContent = el.dataset.orig));
    ctx = gsap.context(() => { animieren(f); }, f);
  }

  // Übersicht
  const ue = document.getElementById("uebersicht");
  folien.forEach((f, i) => {
    const k = document.createElement("div");
    k.className = "ue-karte";
    k.innerHTML = `<span>${String(i + 1).padStart(2, "0")} · ${(f.querySelector(".kicker")?.textContent || "").trim()}</span>${(f.querySelector("h1, h2")?.textContent || "").trim()}`;
    k.addEventListener("click", () => { document.body.classList.remove("uebersicht"); zeige(i, i > aktuell ? 1 : -1); });
    ue.appendChild(k);
  });

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (/^\d$/.test(k)) { eingabe += k; return; }
    if (k === "Enter" && eingabe) { zeige(+eingabe - 1, +eingabe - 1 > aktuell ? 1 : -1); eingabe = ""; return; }
    eingabe = "";
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(k)) { e.preventDefault(); weiter(); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) { e.preventDefault(); zurueck(); }
    else if (k === "Home") zeige(0, -1);
    else if (k === "End") zeige(folien.length - 1, 1);
    else if (k === "f" || k === "F") { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
    else if (k === "o" || k === "O" || k === "Escape") document.body.classList.toggle("uebersicht", k !== "Escape" ? undefined : false);
    else if (k === "b" || k === "B") document.body.classList.toggle("schwarz");
    else if (k === "r" || k === "R") wiederholen();
  });
  buehne.addEventListener("click", (e) => { if (e.target.closest("a")) return; (e.clientX < innerWidth * 0.25 ? zurueck : weiter)(); });
  let touchX = null;
  addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  addEventListener("touchend", (e) => { if (touchX === null) return; const d = e.changedTouches[0].clientX - touchX; if (Math.abs(d) > 50) (d < 0 ? weiter : zurueck)(); touchX = null; });
  addEventListener("mousemove", () => { document.body.classList.remove("ruhig"); clearTimeout(ruhigTimer); ruhigTimer = setTimeout(() => document.body.classList.add("ruhig"), 2500); });
  setTimeout(() => document.getElementById("hilfe").style.opacity = "0", 6000);

  const start = parseInt(location.hash.slice(1), 10);
  const los = () => zeige(isFinite(start) ? start - 1 : 0, 1);
  (document.fonts?.ready || Promise.resolve()).then(los);
})();
