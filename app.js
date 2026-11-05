// America's Equines Registrum — front-end
const API = "https://registrum.eve-868.workers.dev";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const qp = (k) => new URLSearchParams(location.search).get(k);
function msg(el, text, ok) { el.className = "msg " + (ok ? "ok" : "err"); el.textContent = text; el.classList.remove("hidden"); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
function busy(btn, on, label) { if (on) { btn.dataset.l = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span>' + (label || "Working…"); btn.disabled = true; } else { btn.innerHTML = btn.dataset.l; btn.disabled = false; } }
async function getJSON(path) { const r = await fetch(API + path); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Request failed"); return d; }
async function postJSON(path, body) { const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong. Please try again."); return d; }
let COV = null;
async function covenants() { if (!COV) COV = await getJSON("/api/covenants"); return COV; }
function covHtml(list) { return list.map((c) => `<div class="cov-item"><strong>${c.no}. ${esc(c.title)}.</strong> ${esc(c.text)}</div>`).join(""); }

// ----- Browse -----
async function initBrowse() {
  const grid = $("#grid"), q = $("#q"), fb = $("#fbreed"), fs = $("#fsex"), note = $("#note");
  let horses = [];
  try { horses = (await getJSON("/api/horses")).horses; } catch (e) { note.textContent = "The registry could not be loaded right now. Please try again shortly."; return; }
  const uniq = (k) => [...new Set(horses.map((h) => h[k]).filter(Boolean))].sort();
  uniq("breed").forEach((b) => fb.insertAdjacentHTML("beforeend", `<option>${esc(b)}</option>`));
  uniq("sex").forEach((b) => fs.insertAdjacentHTML("beforeend", `<option>${esc(b)}</option>`));
  function render() {
    const t = q.value.trim().toLowerCase();
    const list = horses.filter((h) => (!t || [h.name, h.barn_name, h.reg_no].join(" ").toLowerCase().includes(t)) && (!fb.value || h.breed === fb.value) && (!fs.value || h.sex === fs.value));
    note.textContent = list.length ? `${list.length} recorded horse${list.length === 1 ? "" : "s"}` : "No horses match yet.";
    grid.innerHTML = list.map((h) => `<a class="horse-card" href="horse.html?id=${esc(h.reg_no)}"><div class="ph" style="background-image:url('${esc(h.photo || "registrum-square.png")}')">${h.breed ? `<span class="tag">${esc(h.breed)}</span>` : ""}</div>
<div class="body"><h3>${esc(h.name)}</h3><div class="meta">${esc(h.reg_no)}${h.barn_name ? " · “" + esc(h.barn_name) + "”" : ""}<br>${esc([h.color, h.sex].filter(Boolean).join(" · "))}<br>${h.covenant_count} covenants recorded</div></div></a>`).join("");
  }
  [q, fb, fs].forEach((el) => el.addEventListener("input", render));
  render();
}

// ----- Horse record -----
async function initHorse() {
  const id = (qp("id") || "").toUpperCase();
  const box = $("#horse");
  try {
    const h = (await getJSON("/api/horses/" + encodeURIComponent(id))).horse;
    document.title = h.name + " (" + h.reg_no + ") | America's Equines";
    const rows = [["Registrum ID", h.reg_no], ["Barn name", h.barn_name], ["Breed", h.breed], ["Color", h.color], ["Sex", h.sex], ["Date of birth", h.dob], ["Height (hands)", h.height], ["Markings", h.markings], ["Microchip", h.microchip], ["Brand / tattoo", h.brand], ["Recorded", h.recorded_at ? new Date(h.recorded_at).toLocaleDateString("en-US", { dateStyle: "long" }) : ""]].filter((r) => r[1]);
    box.innerHTML = `<div class="record-head"><div><img id="main" src="${esc(h.photos[0] || "registrum-square.png")}" alt="${esc(h.name)}">${h.photos.length > 1 ? `<div class="thumbs">${h.photos.map((p) => `<img src="${esc(p)}" alt="">`).join("")}</div>` : ""}</div>
<div><p class="eyebrow">Recorded in the Registrum</p><h1>${esc(h.name)}</h1><table class="facts">${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</table>
<div class="btns" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px"><a class="btn btn-solid" href="transfer.html?id=${esc(h.reg_no)}">Transfer This Horse</a>${h.optional_available.length ? `<a class="btn btn-outline" href="add-covenant.html?id=${esc(h.reg_no)}">Add a Covenant</a>` : ""}</div></div></div>
<h2 style="margin-top:44px">Covenants attached to ${esc(h.name)}</h2><p class="legal">These covenants are permanently attached to this horse and bind every owner. Anyone who acquires this horse is on notice of them. See the <a href="terms.html">Registry Terms</a> for the enforcement terms.</p>${covHtml(h.covenants)}`;
    $$(".thumbs img").forEach((t) => t.addEventListener("click", () => ($("#main").src = t.src)));
  } catch (e) {
    box.innerHTML = `<h1>Record not found</h1><p>${esc(e.message)}</p><p><a href="browse.html">Browse recorded horses</a></p>`;
  }
}

// ----- Record a horse -----
async function initRecord() {
  const c = await covenants().catch(() => null);
  if (c) {
    $("#core").innerHTML = covHtml(c.covenants.filter((x) => x.core));
    $("#optional").innerHTML = c.covenants.filter((x) => !x.core).map((x) => `<label class="cov-choice"><input type="checkbox" name="cov" value="${x.no}"><span><span class="t">${x.no}. ${esc(x.title)}</span><br><span class="d">${esc(x.text)}</span></span></label>`).join("");
  }
  if (qp("canceled")) msg($("#m"), "Your recording was not completed because the offering was canceled. You can submit the form again.", false);
  const f = $("#f"), b = $("#go"), agree = $("#agree"), sig = $("#signature");
  const upd = () => (b.disabled = !(agree.checked && sig.value.trim().length >= 3));
  agree.addEventListener("change", upd); sig.addEventListener("input", upd); upd();
  const other = (sel, box) => { const s = $(sel), o = $(box); const u = () => o.classList.toggle("hidden", s.value !== "Other"); s.addEventListener("change", u); u(); };
  other("#breed", "#breed_other_wrap"); other("#color", "#color_other_wrap");
  for (const id of ["photo1", "photo2"]) $("#" + id).addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file && file.size > 3 * 1024 * 1024) { e.target.value = ""; msg($("#m"), "That photo is larger than 3 MB. Please choose a smaller photo (most phones can share a smaller size, or take a screenshot of the photo).", false); }
  });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    busy(b, true, "Saving your record…");
    try {
      const r = await fetch(API + "/api/record", { method: "POST", body: new FormData(f) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong. Please try again.");
      location.href = d.url;
    } catch (err) { busy(b, false); msg($("#m"), err.message, false); }
  });
}

// ----- Add covenant -----
async function initAddCovenant() {
  const id = (qp("id") || "").toUpperCase();
  if (id) $("#reg_no").value = id;
  const c = await covenants().catch(() => null);
  async function load() {
    const reg = $("#reg_no").value.trim().toUpperCase();
    let available = c ? c.covenants.filter((x) => !x.core) : [];
    if (/^HR-\d+$/.test(reg)) { try { const h = (await getJSON("/api/horses/" + reg)).horse; available = available.filter((x) => h.optional_available.some((a) => a.no === x.no)); $("#hname").textContent = "Covenants available to add to " + h.name + ":"; } catch (e) {} }
    $("#optional").innerHTML = available.length ? available.map((x) => `<label class="cov-choice"><input type="checkbox" name="cov" value="${x.no}"><span><span class="t">${x.no}. ${esc(x.title)}</span><br><span class="d">${esc(x.text)}</span></span></label>`).join("") : "<p>All covenants are already attached to this horse.</p>";
  }
  $("#reg_no").addEventListener("change", load); load();
  const b = $("#go"), agree = $("#agree"), sig = $("#signature");
  const upd = () => (b.disabled = !(agree.checked && sig.value.trim().length >= 3));
  agree.addEventListener("change", upd); sig.addEventListener("input", upd); upd();
  $("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const covs = $$("input[name=cov]:checked").map((x) => +x.value);
    busy(b, true);
    try {
      const d = await postJSON("/api/covenants/add", { reg_no: $("#reg_no").value.trim(), email: $("#email").value.trim(), covs, agree: agree.checked, signature: sig.value.trim() });
      $("#f").classList.add("hidden");
      msg($("#m"), `Done. Covenant${d.added.length > 1 ? "s" : ""} ${d.added.join(", ")} ${d.added.length > 1 ? "are" : "is"} now permanently attached. A confirmation has been emailed to you.`, true);
    } catch (err) { busy(b, false); msg($("#m"), err.message, false); }
  });
}

// ----- Transfer request -----
async function initTransfer() {
  const id = (qp("id") || "").toUpperCase();
  if (id) $("#reg_no").value = id;
  const b = $("#go");
  $("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    busy(b, true);
    try {
      await postJSON("/api/transfer", { reg_no: $("#reg_no").value.trim(), current_owner_email: $("#cur").value.trim(), new_owner_name: $("#nname").value.trim(), new_owner_email: $("#nemail").value.trim(), transfer_type: $("#ttype").value });
      $("#f").classList.add("hidden");
      msg($("#m"), "Transfer request received. If the Horse ID and the current owner's email match our records, the current owner has been emailed to approve or decline. If they approve, you'll receive an email to review and sign the covenants and make the $10 transfer offering.", true);
    } catch (err) { busy(b, false); msg($("#m"), err.message, false); }
  });
}

// ----- Thank you (payment return) -----
async function initThanks() {
  const sid = qp("sid"), box = $("#status");
  if (!sid) { box.innerHTML = "<p>Thank you.</p>"; return; }
  for (let i = 0; i < 6; i++) {
    try {
      const d = await getJSON("/api/confirm?sid=" + encodeURIComponent(sid));
      if (d.ok) {
        const link = `<a class="btn btn-solid" href="horse.html?id=${esc(d.reg_no)}">View ${esc(d.name)}'s Record</a>`;
        box.innerHTML = d.kind === "record"
          ? `<h1>${esc(d.name)} is recorded</h1><p class="lede">Your offering was received. ${esc(d.name)} is now part of the Registrum as <strong>${esc(d.reg_no)}</strong>. A confirmation with the covenants has been emailed to you. Keep your Registrum ID and email address; you'll need both to add covenants or approve a transfer.</p><p>${link}</p>`
          : `<h1>Transfer complete</h1><p class="lede">${esc(d.name)} (${esc(d.reg_no)}) is now registered to you. The signed agreement has been emailed to you and to the previous owner. Please keep it for the life of the horse.</p><p>${link}</p>`;
        return;
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 2500));
  }
  box.innerHTML = "<h1>Thank you</h1><p class='lede'>Your payment is being confirmed. You'll receive a confirmation email shortly. If you don't see it within an hour, please check your junk folder or write to info@horseschurch.org.</p>";
}

// ----- Terms page: covenant library from the API -----
async function initTerms() {
  try {
    const c = await covenants();
    $("#corelist").innerHTML = covHtml(c.covenants.filter((x) => x.core));
    $("#optlist").innerHTML = covHtml(c.covenants.filter((x) => !x.core));
    $("#enf").innerHTML = c.enforcement.map((x) => `<div class="cov-item"><strong>${esc(x.title)}.</strong> ${esc(x.text)}</div>`).join("");
  } catch (e) {}
}

const inits = { browse: initBrowse, horse: initHorse, record: initRecord, addcov: initAddCovenant, transfer: initTransfer, thanks: initThanks, terms: initTerms };
document.addEventListener("DOMContentLoaded", () => { const p = document.body.dataset.page; if (inits[p]) inits[p](); });
