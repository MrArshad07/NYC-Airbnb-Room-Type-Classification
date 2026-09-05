(() => {
  "use strict";

  /* ============================================================
     0. CONFIG
     ============================================================ */
  const DEFAULT_API_BASE = "http://127.0.0.1:8000";
  const STORAGE_KEY = "room-predictor-api-base";
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function getApiBase() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_API_BASE;
  }
  function setApiBase(url) {
    localStorage.setItem(STORAGE_KEY, url);
  }

  // Approximate NYC bounding box, used only for the visual mini-map pin.
  const NYC_BOUNDS = { latMin: 40.49, latMax: 40.92, lonMin: -74.26, lonMax: -73.68 };

  // Known label set for the classic NYC Airbnb "room_type" target, in the
  // alphabetical order scikit-learn stores in `classes_` by default. Used
  // only as a best-effort legend for the probability breakdown when the
  // API doesn't tell us the class order explicitly (see note in README
  // section of the chat response). The headline prediction always comes
  // straight from `Predicted_room_type`, never from this guess.
  const KNOWN_LABEL_SETS = {
    4: ["Entire home/apt", "Hotel room", "Private room", "Shared room"],
    3: ["Entire home/apt", "Private room", "Shared room"],
    2: ["Entire home/apt", "Private room"],
  };

  const ROOM_ICONS = {
    "entire home/apt": `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V10"/></svg>`,
    "private room": `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="3" width="16" height="18" rx="1.2"/><circle cx="14.5" cy="12" r="1"/></svg>`,
    "shared room": `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 19v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/><path d="M3 19h18M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/></svg>`,
    "hotel room": `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 21V6a1 1 0 0 1 1-1h5v16"/><path d="M9 10h11a1 1 0 0 1 1 1v10"/><path d="M13 14h.01M3 21h18"/></svg>`,
    default: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  };

  const SAMPLE_LISTINGS = [
    { latitude: 40.71427, longitude: -74.00597, price: 220, minimum_nights: 2, number_of_reviews: 84, reviews_per_month: 2.1, calculated_host_listings_count: 1, availability_365: 210, neighbourhood_group: "Manhattan", neighbourhood: "SoHo" },
    { latitude: 40.68345, longitude: -73.95632, price: 65, minimum_nights: 3, number_of_reviews: 240, reviews_per_month: 4.6, calculated_host_listings_count: 3, availability_365: 300, neighbourhood_group: "Brooklyn", neighbourhood: "Bedford-Stuyvesant" },
    { latitude: 40.7484, longitude: -73.8365, price: 40, minimum_nights: 1, number_of_reviews: 12, reviews_per_month: 0.6, calculated_host_listings_count: 8, availability_365: 45, neighbourhood_group: "Queens", neighbourhood: "Jackson Heights" },
    { latitude: 40.8296, longitude: -73.9262, price: 300, minimum_nights: 1, number_of_reviews: 3, reviews_per_month: 0.2, calculated_host_listings_count: 12, availability_365: 365, neighbourhood_group: "Bronx", neighbourhood: "Concourse" },
  ];

  /* ============================================================
     1. SKYLINE BACKDROP — quiet drifting light points
     ============================================================ */
  function initSkyline() {
    const canvas = document.getElementById("skyline");
    const ctx = canvas.getContext("2d");
    let w, h, points;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      const count = Math.round((w * h) / 42000);
      points = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.1 + 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: 0.15 + Math.random() * 0.25,
        drift: (Math.random() - 0.5) * 0.05,
      }));
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      for (const p of points) {
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.0006 * p.speed + p.phase));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        const isAmber = p.phase % 2 > 1;
        ctx.fillStyle = isAmber
          ? `rgba(255, 180, 84, ${twinkle * 0.55})`
          : `rgba(87, 217, 200, ${twinkle * 0.4})`;
        ctx.fill();
        if (!prefersReducedMotion) {
          p.y -= p.drift;
          if (p.y < -5) p.y = h + 5;
          if (p.y > h + 5) p.y = -5;
        }
      }
      if (!prefersReducedMotion) requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(draw);
    if (prefersReducedMotion) draw(0);
  }

  /* ============================================================
     2. SETTINGS POPOVER
     ============================================================ */
  function initSettings() {
    const btn = document.getElementById("settings-btn");
    const popover = document.getElementById("settings-popover");
    const input = document.getElementById("api-base-input");
    const saveBtn = document.getElementById("api-base-save");
    const resetBtn = document.getElementById("api-base-reset");

    input.value = getApiBase();

    function open() {
      popover.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      input.focus();
    }
    function close() {
      popover.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      popover.classList.contains("open") ? close() : open();
    });
    document.addEventListener("click", (e) => {
      if (!popover.contains(e.target) && e.target !== btn) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    saveBtn.addEventListener("click", () => {
      const val = input.value.trim().replace(/\/$/, "");
      if (val) {
        setApiBase(val);
        close();
        checkStatus();
      }
    });
    resetBtn.addEventListener("click", () => {
      setApiBase(DEFAULT_API_BASE);
      input.value = DEFAULT_API_BASE;
      close();
      checkStatus();
    });
  }

  /* ============================================================
     3. STATUS PILL
     ============================================================ */
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");

  async function checkStatus() {
    statusDot.className = "dot";
    statusText.textContent = "Checking service…";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(getApiBase() + "/", { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        statusDot.className = "dot online";
        statusText.textContent = "Service connected";
      } else {
        throw new Error("bad status");
      }
    } catch {
      statusDot.className = "dot offline";
      statusText.textContent = "Service offline";
    }
  }

  /* ============================================================
     4. MINI MAP — live pin from lat/long, borough highlight
     ============================================================ */
  function initMiniMap() {
    const latInput = document.getElementById("latitude");
    const lonInput = document.getElementById("longitude");
    const boroughSelect = document.getElementById("neighbourhood_group");
    const pin = document.getElementById("map-pin");
    const ring = document.getElementById("map-pin-ring");
    const caption = document.getElementById("map-caption");
    const clusters = document.querySelectorAll(".cluster");

    function updatePin() {
      const lat = parseFloat(latInput.value);
      const lon = parseFloat(lonInput.value);
      if (Number.isNaN(lat) || Number.isNaN(lon)) {
        caption.textContent = "Drop coordinates to place the pin";
        return;
      }
      const inBounds =
        lat >= NYC_BOUNDS.latMin && lat <= NYC_BOUNDS.latMax &&
        lon >= NYC_BOUNDS.lonMin && lon <= NYC_BOUNDS.lonMax;

      const clampedLat = Math.min(Math.max(lat, NYC_BOUNDS.latMin), NYC_BOUNDS.latMax);
      const clampedLon = Math.min(Math.max(lon, NYC_BOUNDS.lonMin), NYC_BOUNDS.lonMax);

      const xPct = (clampedLon - NYC_BOUNDS.lonMin) / (NYC_BOUNDS.lonMax - NYC_BOUNDS.lonMin);
      const yPct = 1 - (clampedLat - NYC_BOUNDS.latMin) / (NYC_BOUNDS.latMax - NYC_BOUNDS.latMin);

      const x = 30 + xPct * 140;
      const y = 15 + yPct * 190;

      pin.setAttribute("cx", x);
      pin.setAttribute("cy", y);
      ring.setAttribute("cx", x);
      ring.setAttribute("cy", y);

      caption.textContent = inBounds ? "Pinned" : "Outside the five boroughs";
    }

    function updateBorough() {
      clusters.forEach((c) => {
        c.classList.toggle("active", c.dataset.borough === boroughSelect.value);
      });
    }

    latInput.addEventListener("input", updatePin);
    lonInput.addEventListener("input", updatePin);
    boroughSelect.addEventListener("change", updateBorough);
  }

  /* ============================================================
     5. VALIDATION
     ============================================================ */
  const FIELD_RULES = {
    latitude: { min: -90, max: 90, type: "float" },
    longitude: { min: -180, max: 180, type: "float" },
    price: { min: 0.0000001, type: "float", exclusiveMin: true },
    minimum_nights: { min: 1, max: 365, type: "int" },
    number_of_reviews: { min: 0, type: "int" },
    reviews_per_month: { min: 0, type: "float" },
    calculated_host_listings_count: { min: 0, type: "int" },
    availability_365: { min: 0, max: 365, type: "int" },
    neighbourhood_group: { type: "text" },
    neighbourhood: { type: "text" },
  };

  function validateField(name, rawValue) {
    const rule = FIELD_RULES[name];
    const errEl = document.getElementById("err-" + name);
    const inputEl = document.getElementById(name);
    let message = "";

    if (rawValue === "" || rawValue === null || rawValue === undefined) {
      message = "Required";
    } else if (rule.type === "text") {
      if (String(rawValue).trim().length < 1) message = "Required";
    } else {
      const num = Number(rawValue);
      if (Number.isNaN(num)) {
        message = "Enter a number";
      } else if (rule.type === "int" && !Number.isInteger(num)) {
        message = "Whole numbers only";
      } else if (rule.exclusiveMin && num <= rule.min) {
        message = "Must be greater than 0";
      } else if (rule.min !== undefined && num < rule.min) {
        message = `Must be at least ${rule.min}`;
      } else if (rule.max !== undefined && num > rule.max) {
        message = `Must be at most ${rule.max}`;
      }
    }

    if (errEl) errEl.textContent = message;
    if (inputEl) inputEl.classList.toggle("invalid", Boolean(message));
    return message === "";
  }

  function attachLiveValidation() {
    Object.keys(FIELD_RULES).forEach((name) => {
      const el = document.getElementById(name);
      if (!el) return;
      el.addEventListener("blur", () => validateField(name, el.value));
      el.addEventListener("input", () => {
        if (el.classList.contains("invalid")) validateField(name, el.value);
      });
    });
  }

  function validateAll(form) {
    let allValid = true;
    Object.keys(FIELD_RULES).forEach((name) => {
      const el = form.elements[name];
      if (!el) return;
      const ok = validateField(name, el.value);
      allValid = allValid && ok;
    });
    return allValid;
  }

  /* ============================================================
     6. SAMPLE LOADER
     ============================================================ */
  function initSampleLoader(form) {
    const btn = document.getElementById("sample-btn");
    btn.addEventListener("click", () => {
      const sample = SAMPLE_LISTINGS[Math.floor(Math.random() * SAMPLE_LISTINGS.length)];
      Object.entries(sample).forEach(([key, value]) => {
        const el = form.elements[key];
        if (el) {
          el.value = value;
          el.classList.remove("invalid");
          const errEl = document.getElementById("err-" + key);
          if (errEl) errEl.textContent = "";
        }
      });
      form.dispatchEvent(new Event("sample-loaded"));
      document.getElementById("latitude").dispatchEvent(new Event("input"));
      document.getElementById("neighbourhood_group").dispatchEvent(new Event("change"));
    });
  }

  /* ============================================================
     7. RESULT PANEL STATE MACHINE
     ============================================================ */
  const states = ["idle", "loading", "error", "result"];
  function showState(name) {
    states.forEach((s) => {
      const el = document.getElementById("state-" + s);
      if (!el) return;
      el.hidden = s !== name;
    });
  }

  function iconFor(label) {
    return ROOM_ICONS[String(label).toLowerCase()] || ROOM_ICONS.default;
  }

  function guessLabels(count) {
    return KNOWN_LABEL_SETS[count] || Array.from({ length: count }, (_, i) => `Option ${i + 1}`);
  }

  const SEGMENT_COLORS = ["#FFB454", "#57D9C8", "#8AA0FF", "#FF8B85", "#C9A6FF"];

  function renderResult(predictedLabel, probabilities) {
    const labels = guessLabels(probabilities.length);
    const pairs = probabilities.map((p, i) => ({
      label: labels[i] ?? `Option ${i + 1}`,
      value: p,
      isTop: false,
    }));

    // Mark whichever row matches the actual predicted label (case-insensitive);
    // if none match (label set guess didn't line up), mark the highest value instead.
    let topIndex = pairs.findIndex(
      (p) => p.label.toLowerCase() === String(predictedLabel).toLowerCase()
    );
    if (topIndex === -1) {
      topIndex = pairs.reduce((best, p, i, arr) => (p.value > arr[best].value ? i : best), 0);
    }
    pairs[topIndex].isTop = true;
    const confidence = pairs[topIndex].value;

    // Sort a display copy by value, descending, but keep original for chart order.
    const sorted = [...pairs].sort((a, b) => b.value - a.value);

    document.getElementById("result-title").textContent = predictedLabel;
    document.getElementById("result-icon").innerHTML = iconFor(predictedLabel);

    // Donut segments
    const r = 64;
    const circumference = 2 * Math.PI * r;
    const g = document.getElementById("donut-segments");
    g.innerHTML = "";
    let cumulative = 0;
    pairs.forEach((p, i) => {
      const seg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      seg.setAttribute("cx", "80");
      seg.setAttribute("cy", "80");
      seg.setAttribute("r", String(r));
      seg.setAttribute("class", "donut-seg");
      seg.style.stroke = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      seg.style.strokeDasharray = `${circumference}`;
      seg.style.strokeDashoffset = `${circumference}`;
      g.appendChild(seg);

      const len = p.value * circumference;
      requestAnimationFrame(() => {
        seg.style.strokeDasharray = `${len} ${circumference - len}`;
        seg.style.strokeDashoffset = `${-cumulative}`;
      });
      cumulative += len;
    });

    // Animated center percentage count-up
    animateCount(document.getElementById("result-pct"), confidence * 100);

    // Breakdown bars
    const breakdown = document.getElementById("breakdown");
    breakdown.innerHTML = "";
    sorted.forEach((p) => {
      const row = document.createElement("div");
      row.className = "breakdown-row" + (p.isTop ? " top-pick" : "");
      row.innerHTML = `
        <div class="breakdown-top">
          <span>${p.label}</span>
          <span class="val">0%</span>
        </div>
        <div class="breakdown-track">
          <div class="breakdown-fill"></div>
        </div>
      `;
      breakdown.appendChild(row);
      const fill = row.querySelector(".breakdown-fill");
      const valEl = row.querySelector(".val");
      requestAnimationFrame(() => {
        fill.style.width = `${(p.value * 100).toFixed(1)}%`;
      });
      animateCount(valEl, p.value * 100);
    });

    showState("result");
  }

  function animateCount(el, target) {
    if (prefersReducedMotion) {
      el.textContent = `${target.toFixed(1)}%`;
      return;
    }
    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = `${(target * eased).toFixed(1)}%`;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ============================================================
     8. SUBMIT HANDLER
     ============================================================ */
  function initForm() {
    const form = document.getElementById("predict-form");
    const submitBtn = document.getElementById("predict-btn");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const valid = validateAll(form);
      if (!valid) {
        submitBtn.classList.add("shake");
        setTimeout(() => submitBtn.classList.remove("shake"), 500);
        const firstInvalid = form.querySelector(".invalid");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const payload = {
        latitude: parseFloat(form.latitude.value),
        longitude: parseFloat(form.longitude.value),
        price: parseFloat(form.price.value),
        minimum_nights: parseInt(form.minimum_nights.value, 10),
        number_of_reviews: parseInt(form.number_of_reviews.value, 10),
        reviews_per_month: parseFloat(form.reviews_per_month.value),
        calculated_host_listings_count: parseInt(form.calculated_host_listings_count.value, 10),
        availability_365: parseInt(form.availability_365.value, 10),
        neighbourhood_group: form.neighbourhood_group.value,
        neighbourhood: form.neighbourhood.value.trim(),
      };

      submitBtn.classList.add("loading");
      submitBtn.disabled = true;
      showState("loading");

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(getApiBase() + "/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          let detailMsg = `The service responded with an error (status ${res.status}).`;
          try {
            const body = await res.json();
            if (body && body.detail) {
              detailMsg = Array.isArray(body.detail)
                ? body.detail.map((d) => d.msg || JSON.stringify(d)).join(" · ")
                : String(body.detail);
            }
          } catch {
            /* keep default message */
          }
          document.getElementById("error-detail").textContent = detailMsg;
          showState("error");
          return;
        }

        const data = await res.json();
        renderResult(data.Predicted_room_type, data.Probability);
      } catch (err) {
        const msg =
          err.name === "AbortError"
            ? "The request took too long and was cancelled. Is the service running?"
            : "Couldn't reach the API. Check the URL in settings and that the server is running.";
        document.getElementById("error-detail").textContent = msg;
        showState("error");
      } finally {
        submitBtn.classList.remove("loading");
        submitBtn.disabled = false;
      }
    });
  }

  /* ============================================================
     INIT
     ============================================================ */
  document.addEventListener("DOMContentLoaded", () => {
    initSkyline();
    initSettings();
    initMiniMap();
    attachLiveValidation();
    initForm();
    initSampleLoader(document.getElementById("predict-form"));
    checkStatus();
  });
})();
