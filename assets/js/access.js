"use strict";

// SHA-256 hash of the access key.
// To change: open browser console and run:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-new-key'))
//     .then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))
const ACCESS_HASH = "84e27f34a3cecd00ec5164dccc649b40054d392bb0a5b3cb799f0fbeaf09c583";
const SESSION_KEY = "ariya_unlocked";

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function tryUnlock(key) {
  if (!key) return false;
  return (await sha256hex(key)) === ACCESS_HASH;
}

function revealApp() {
  document.getElementById("gate-overlay")?.remove();
  document.documentElement.dataset.unlocked = "1";
}

async function init() {
  if (!crypto?.subtle) {
    document.getElementById("gate-key-input").disabled = true;
    document.getElementById("gate-key-input").placeholder = "Requires HTTPS";
    document.querySelector("#gate-form button[type=submit]").disabled = true;
    document.getElementById("gate-error").textContent =
      "Secure context required. Open this page over HTTPS.";
    document.getElementById("gate-error").style.display = "block";
    document.getElementById("gate-overlay").style.display = "flex";
    return;
  }

  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    revealApp();
    return;
  }

  const hashKey = location.hash.slice(1);
  if (hashKey && (await tryUnlock(hashKey))) {
    sessionStorage.setItem(SESSION_KEY, "1");
    history.replaceState(null, "", location.pathname + location.search);
    revealApp();
    return;
  }

  const overlay = document.getElementById("gate-overlay");
  overlay.style.display = "flex";

  const form = document.getElementById("gate-form");
  const input = document.getElementById("gate-key-input");
  const error = document.getElementById("gate-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = input.value.trim();
    if (!key) return;

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Checking…";

    if (await tryUnlock(key)) {
      sessionStorage.setItem(SESSION_KEY, "1");
      revealApp();
    } else {
      error.style.display = "block";
      input.value = "";
      input.focus();
      btn.disabled = false;
      btn.textContent = "Unlock";
    }
  });
}

init();
