// America's Equines Registrum — Cloudflare Worker
// Bindings: DB (D1), PHOTOS (R2)
// Vars: SITE_URL, WORKER_URL, MAKE_MAIL_HOOK
// Secrets: STRIPE_SECRET_KEY, ADMIN_PASSWORD

const COVENANTS = [
  ["Covenants Follow the Horse", "These Covenants are attached to the Horse, not to any one person. Each Owner accepts them as a condition of owning the Horse and is bound by them for as long as they own it. Before the Horse is sold, given, leased for more than 90 days, or otherwise transferred, the Owner must require the new owner to accept these same Covenants through the America's Equines registry. An Owner who transfers the Horse without doing so stays fully responsible for any breach by the next owner."],
  ["No Slaughter", "The Owner will not sell, give, trade, consign, or otherwise transfer the Horse to slaughter, or to any person or business the Owner knows or reasonably should know buys horses for slaughter, including kill buyers, kill pens, and feedlots. The Owner will not allow the Horse to be killed for human or animal consumption anywhere in the world."],
  ["No Export or Auction for Slaughter", "The Owner will not ship or allow the Horse to be shipped to Canada, Mexico, or any other country for slaughter. The Owner will not consign the Horse to a livestock auction, sale barn, or dealer without first offering it under Covenant 6 if that Covenant is attached, and any such sale must be subject to these Covenants."],
  ["Transfers Only Through the Registry", "Ownership of the Horse may only pass to a new owner who accepts these Covenants through the America's Equines registry. Any transfer that does not follow this process is a breach of these Covenants."],
  ["Notice of Changes", "The Owner will tell the Church within 30 days if the Horse moves to a new address, is lost or stolen, dies, or is euthanized, and will keep the Owner's own contact information current with the registry."],
  ["Right of First Refusal", "Before selling or giving away the Horse, the Owner will first offer it in writing to the Horse's previous registered owner, through the America's Equines registry. The price will be one the Owner and the previous owner agree on, or, if they cannot agree, the same price offered by the new buyer. The previous owner has 14 days to accept. If they decline, do not answer, or cannot be reached at the contact information on file with the registry, the Owner may transfer the Horse to someone else under Covenant 4."],
  ["Humane End of Life", "If the Horse must be euthanized, it will be done humanely by a licensed veterinarian, and only for the Horse's own welfare."],
  ["Standard of Care", "The Owner will provide the Horse with clean water at all times, adequate feed and forage, shelter from weather, room to move, routine hoof care, dental care, vaccinations and deworming as advised by a veterinarian, and prompt veterinary care when sick or injured."],
  ["Welfare Checks", "Once a year, and within 14 days of a reasonable request, the Owner will send the Church current photos of the Horse and, if asked, its most recent veterinary record. The Owner will allow the Church to visit the Horse at a reasonable time with 48 hours' notice."],
  ["Retirement", "The Horse will not be ridden, driven, raced, or worked beyond what a veterinarian considers safe for its age and condition. Once retired by a veterinarian, it will live out its life as a companion horse."],
  ["Identification Kept", "The Owner will keep the Horse's microchip registered to the Owner's name and will not remove, alter, or hide any microchip, brand, or tattoo."],
];
const CORE = [1, 2, 3, 4, 5];
const OPTIONAL = [6, 7, 8, 9, 10, 11];

const ENFORCEMENT = [
  ["A. Consideration", "The new Owner pays a $10 transfer fee and receives ownership of the Horse in exchange for accepting these Covenants. Both parties agree this is a fair exchange."],
  ["B. Who May Enforce", "The Church may enforce these Covenants against any Owner. Each prior Owner who accepted them, and the Owner who added any optional Covenant, is an intended third-party beneficiary and may also enforce them."],
  ["C. Return of the Horse", "Each horse is unique and money alone cannot make up for a breach. If an Owner breaches Covenant 2, 3, or 4, or a breach puts the Horse's welfare at risk, a court may order the Horse returned to the Church and may order an Owner not to sell, ship, or harm the Horse while a dispute is pending. The Owner agrees not to oppose such an order on the ground that money damages would be enough."],
  ["D. Attorney's Fees", "The party who wins a lawsuit to enforce these Covenants will be paid its reasonable attorney's fees and court costs by the other side."],
  ["E. Governing Law and Court", "Arkansas law governs these Covenants. Any lawsuit will be filed in Izard County, Arkansas, unless the Church chooses to sue where the Horse is located."],
  ["F. How Long They Last", "These Covenants last for the Horse's whole life and bind each Owner in turn. An Owner's duties end once the Horse is transferred properly through the registry, except for any breach that happened while they owned it."],
  ["G. Electronic Signature", "The Owner agrees that checking the box, typing their name, and clicking the agree button is their legal signature, with the same effect as signing on paper."],
  ["H. If a Part Is Struck Down", "If a court finds any part of these Covenants unenforceable, it will be enforced as far as the law allows, and the rest stays in effect."],
  ["I. Entire Agreement", "These Covenants and the Registry Terms are the whole agreement about the Horse's protections. They can only be changed in writing through the registry with the Church's approval."],
];

const TRANSFER_TYPES = ["Sale", "Gift", "Inheritance", "Donation", "Rehoming / Adoption", "Other"];
const MAX_PHOTO = 3 * 1024 * 1024;
const RECORD_FIRST_CENTS = 1500;
const RECORD_ADDITIONAL_CENTS = 1000;
const TRANSFER_CENTS = 1000;

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const clean = (s, max = 500) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
const lowerEmail = (s) => clean(s, 254).toLowerCase();
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const regNo = (id) => "HR-" + String(id).padStart(4, "0");
const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const isToken = (s) => /^[0-9a-f-]{36}$/.test(s || "");
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "long", timeStyle: "short" }) + " (Central)";
};
const covList = (str) => String(str || "").split(",").map((x) => parseInt(x, 10)).filter((n) => OPTIONAL.includes(n));
const allCovNums = (h) => [...CORE, ...covList(h.optional_covenants)].sort((a, b) => a - b);

function cors(env) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
function json(data, status = 200, env) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors(env) } });
}
function html(body, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function stripe(env, method, path, params) {
  const init = { method, headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY } };
  let url = (env.STRIPE_API_BASE || "https://api.stripe.com/v1/") + path;
  if (params) {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.append(k, String(v));
    if (method === "GET") url += "?" + body.toString();
    else { init.body = body.toString(); init.headers["Content-Type"] = "application/x-www-form-urlencoded"; }
  }
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || "Stripe error");
  return data;
}

async function createCheckout(env, { name, cents, email, ref, metadata, successUrl, cancelUrl }) {
  const p = {
    mode: "payment",
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": cents,
    "line_items[0][price_data][product_data][name]": name,
    allow_promotion_codes: "true",
    customer_email: email,
    client_reference_id: ref,
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
  for (const [k, v] of Object.entries(metadata || {})) p["metadata[" + k + "]"] = v;
  return stripe(env, "POST", "checkout/sessions", p);
}

// ---------- email (sent by Make from the church Outlook account) ----------
async function queueMail(env, ctx, to, subject, bodyHtml) {
  const list = [...new Set(to.filter(isEmail))];
  for (const addr of list) {
    const id = uuid();
    await env.DB.prepare("INSERT INTO mail (id, to_list, subject, html) VALUES (?, ?, ?, ?)").bind(id, addr, subject, emailShell(bodyHtml)).run();
    if (env.MAKE_MAIL_HOOK) {
      const p = fetch(env.MAKE_MAIL_HOOK + (env.MAKE_MAIL_HOOK.includes("?") ? "&" : "?") + "id=" + id).catch(() => {});
      ctx ? ctx.waitUntil(p) : await p;
    }
  }
}
function emailShell(inner) {
  return `<div style="font-family:Georgia,serif;color:#2A1B3D;max-width:640px;margin:0 auto;line-height:1.55;font-size:15px">
<div style="border-top:5px solid #C9A227;padding:20px 0 6px"><div style="font-family:Georgia,serif;letter-spacing:.08em;font-size:13px;color:#4B2578">AMERICA'S EQUINES &middot; THE REGISTRUM OF H.O.R.S.E.S. CHURCH</div></div>
${inner}
<p style="margin-top:28px;font-size:13px;color:#6b5a7d">Questions? Write to info@horseschurch.org.</p></div>`;
}
const btn = (href, label) => `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#241333;color:#E8CD6D;text-decoration:none;padding:12px 22px;border-radius:3px;font-family:Georgia,serif;letter-spacing:.05em">${esc(label)}</a></p>`;

function covenantsHtml(nums) {
  return nums.map((n) => `<p><strong>${n}. ${esc(COVENANTS[n - 1][0])}.</strong> ${esc(COVENANTS[n - 1][1])}</p>`).join("");
}
function enforcementHtml() {
  return ENFORCEMENT.map(([t, b]) => `<p><strong>${esc(t)}.</strong> ${esc(b)}</p>`).join("");
}
function covenantsText(nums) {
  return nums.map((n) => `${n}. ${COVENANTS[n - 1][0]}. ${COVENANTS[n - 1][1]}`).join("\n\n");
}
function enforcementText() {
  return ENFORCEMENT.map(([t, b]) => `${t}. ${b}`).join("\n\n");
}
function agreementIntro(h) {
  return `America's Equines Transfer of Ownership Agreement. You are about to become the registered owner of ${h.name} (Registrum ID ${h.reg_no}${h.microchip ? ", microchip " + h.microchip : ""}) ("the Horse"). The Horse is protected by the Covenants listed below, which were attached to the Horse by a prior owner and are recorded with H.O.R.S.E.S. Church ("the Church"). These Covenants are a condition of owning the Horse. By accepting this transfer, you agree to be bound by every Covenant for as long as you own the Horse, and to require any future owner to accept them before the Horse leaves your ownership.`;
}

// ---------- page shell for Worker-served pages ----------
function page(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} | America's Equines</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#F7F1E1;font-family:'EB Garamond',Georgia,serif;color:#2A1B3D;font-size:18px;line-height:1.55}
.c{max-width:760px;margin:40px auto;background:#fffdf8;border-top:6px solid #C9A227;box-shadow:0 2px 12px rgba(0,0,0,.08);padding:34px 30px}
h1,h2{font-family:Cinzel,Georgia,serif;color:#241333;font-weight:600;line-height:1.25}h1{font-size:28px;margin:0 0 14px}h2{font-size:20px;margin:28px 0 8px}
.cov{background:#F7F1E1;border:1px solid #e6dcc2;padding:14px 18px;margin:14px 0;max-height:none}
.cov p{margin:0 0 12px;font-size:16.5px}
label.chk{display:flex;gap:12px;align-items:flex-start;margin:18px 0;font-weight:600}
label.chk input{width:22px;height:22px;margin-top:4px;flex:none}
input[type=text]{width:100%;padding:12px;font-size:18px;border:1px solid #c9bda0;font-family:inherit;box-sizing:border-box}
button{background:#241333;color:#E8CD6D;border:0;padding:14px 26px;font-family:Cinzel,Georgia,serif;font-size:16px;letter-spacing:.05em;cursor:pointer;border-radius:3px;margin-top:14px}
button:disabled{opacity:.4;cursor:not-allowed}.small{font-size:15px;color:#5b4b6b}.a{text-transform:uppercase;font-weight:600}
a{color:#4B2578}
</style></head><body><div class="c">${inner}</div></body></html>`;
}

// ---------- data access ----------
async function horseByReg(env, reg) {
  const m = /^HR-(\d{1,7})$/i.exec(String(reg || "").trim());
  if (!m) return null;
  return env.DB.prepare("SELECT * FROM horses WHERE id = ?").bind(parseInt(m[1], 10)).first();
}
function publicHorse(env, h, full) {
  const photo = (k) => (k ? env.WORKER_URL + "/photo/" + k : null);
  const out = {
    reg_no: h.reg_no,
    name: h.name,
    barn_name: h.barn_name,
    breed: h.breed === "Other" && h.breed_other ? h.breed_other : h.breed,
    color: h.color === "Other" && h.color_other ? h.color_other : h.color,
    sex: h.sex,
    photo: photo(h.photo1),
    covenant_count: allCovNums(h).length,
  };
  if (full) {
    Object.assign(out, {
      dob: h.dob, height: h.height, markings: h.markings, microchip: h.microchip, brand: h.brand,
      photos: [photo(h.photo1), photo(h.photo2)].filter(Boolean),
      recorded_at: h.paid_at,
      covenants: allCovNums(h).map((n) => ({ no: n, title: COVENANTS[n - 1][0], text: COVENANTS[n - 1][1] })),
      optional_available: OPTIONAL.filter((n) => !covList(h.optional_covenants).includes(n)).map((n) => ({ no: n, title: COVENANTS[n - 1][0] })),
    });
  }
  return out;
}

// ---------- finalize after payment ----------
async function finalizeSession(env, ctx, session) {
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  if (!paid || session.status !== "complete") return { ok: false };
  const md = session.metadata || {};
  if (md.kind === "record") {
    const h = await env.DB.prepare("SELECT * FROM horses WHERE id = ? AND stripe_session = ?").bind(parseInt(md.horse_id, 10), session.id).first();
    if (!h) return { ok: false };
    if (h.status === "pending_payment") {
      const r = await env.DB.prepare("UPDATE horses SET status='recorded', paid_at=?, offering_cents=? WHERE id=? AND status='pending_payment'").bind(nowIso(), session.amount_total ?? 0, h.id).run();
      if (r.meta.changes) {
        await env.DB.prepare("INSERT INTO ownership (horse_id, owner_name, owner_email) VALUES (?, ?, ?)").bind(h.id, h.owner_name, h.owner_email).run();
        const link = env.SITE_URL + "/horse.html?id=" + h.reg_no;
        await queueMail(env, ctx, [h.owner_email], `${h.name} is recorded in the Registrum (${h.reg_no})`,
          `<h2 style="font-family:Georgia,serif">${esc(h.name)} is now recorded</h2>
<p>Dear ${esc(h.owner_name)},</p><p>Your recording offering was received, and <strong>${esc(h.name)}</strong> is now part of the Registrum of H.O.R.S.E.S. Church as <strong>${esc(h.reg_no)}</strong>.</p>
<p>Keep this Registrum ID and the email address you used. You will need both to add covenants or approve a transfer.</p>${btn(link, "View the Record")}
<p><strong>Covenants attached to ${esc(h.name)}</strong> (signed by ${esc(h.owner_signature)} on ${esc(fmtDate(h.owner_signed_at))}):</p>${covenantsHtml(allCovNums(h))}
<p><strong>Enforcement Terms</strong></p>${enforcementHtml()}`);
      }
    }
    return { ok: true, kind: "record", reg_no: h.reg_no, name: h.name };
  }
  if (md.kind === "transfer") {
    const t = await env.DB.prepare("SELECT * FROM transfers WHERE id = ? AND stripe_session = ?").bind(parseInt(md.transfer_id, 10), session.id).first();
    if (!t) return { ok: false };
    const h = await env.DB.prepare("SELECT * FROM horses WHERE id = ?").bind(t.horse_id).first();
    if (t.status === "signed") {
      const r = await env.DB.prepare("UPDATE transfers SET status='complete', completed_at=?, paid_cents=? WHERE id=? AND status='signed'").bind(nowIso(), session.amount_total ?? 0, t.id).run();
      if (r.meta.changes) {
        await env.DB.batch([
          env.DB.prepare("UPDATE horses SET owner_name=?, owner_email=? WHERE id=?").bind(t.new_owner_name, t.new_owner_email, h.id),
          env.DB.prepare("UPDATE ownership SET end_at=? WHERE horse_id=? AND end_at IS NULL").bind(nowIso(), h.id),
          env.DB.prepare("INSERT INTO ownership (horse_id, owner_name, owner_email, transfer_id) VALUES (?, ?, ?, ?)").bind(h.id, t.new_owner_name, t.new_owner_email, t.id),
        ]);
        const link = env.SITE_URL + "/horse.html?id=" + h.reg_no;
        await queueMail(env, ctx, [t.new_owner_email, t.prev_owner_email], `Signed Transfer Agreement — ${h.name} (${h.reg_no})`,
          `<h2 style="font-family:Georgia,serif">Transfer complete</h2>
<p>Ownership of <strong>${esc(h.name)}</strong> (${esc(h.reg_no)}) has passed from ${esc(t.prev_owner_name || t.prev_owner_email)} to <strong>${esc(t.new_owner_name)}</strong>. The covenants remain attached to the horse.</p>${btn(link, "View the Record")}
<p style="font-size:13px;color:#6b5a7d">Transfer ID: T-${t.id} &middot; Signed by ${esc(t.signed_name)} on ${esc(fmtDate(t.signed_at))} &middot; Seller confirmation: ${t.seller_confirmed ? "yes" : "no"}</p>
<p><strong>Your signed agreement</strong> (keep this email for the life of the horse):</p>
<div style="background:#F7F1E1;border:1px solid #e6dcc2;padding:14px 18px;white-space:pre-wrap;font-size:14px">${esc(t.agreement_snapshot)}</div>`);
      }
    }
    return { ok: true, kind: "transfer", reg_no: h.reg_no, name: h.name };
  }
  return { ok: false };
}

// ---------- handlers ----------
async function handleRecord(request, env) {
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.includes("multipart/form-data")) return json({ error: "Please submit the form." }, 400, env);
  const f = await request.formData();
  const g = (k, m) => clean(f.get(k), m);
  const d = {
    name: g("name", 120), barn_name: g("barn_name", 120), breed: g("breed", 80), breed_other: g("breed_other", 80),
    color: g("color", 80), color_other: g("color_other", 80), sex: g("sex", 40), dob: g("dob", 20), height: g("height", 20),
    markings: g("markings", 2000), microchip: g("microchip", 40), brand: g("brand", 500), location: g("location", 1000),
    allow_public: f.get("allow_public") === "yes" ? 1 : 0, owner_name: g("owner_name", 120), owner_email: lowerEmail(f.get("owner_email")),
    signature: g("signature", 120), agree: f.get("agree") === "yes",
  };
  const optional = f.getAll("cov").map((x) => parseInt(x, 10)).filter((n) => OPTIONAL.includes(n));
  const errs = [];
  if (!d.name) errs.push("Registered name is required.");
  if (!d.breed) errs.push("Breed is required.");
  if (!d.sex) errs.push("Sex is required.");
  if (!d.color) errs.push("Color is required.");
  if (!d.owner_name) errs.push("Your full name is required.");
  if (!isEmail(d.owner_email)) errs.push("A valid email address is required.");
  if (!d.agree) errs.push("Please check the box to accept the covenants.");
  if (d.signature.length < 3) errs.push("Please type your full legal name to sign.");
  const photos = [];
  for (const k of ["photo1", "photo2"]) {
    const file = f.get(k);
    if (file && typeof file === "object" && file.size > 0) {
      if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/.test(file.type)) errs.push("Photos must be images (JPG, PNG, WEBP, or HEIC).");
      else if (file.size > MAX_PHOTO) errs.push("Each photo must be 3 MB or smaller.");
      else photos.push([k, file]);
    } else if (k === "photo1") errs.push("A front photo of your horse is required.");
  }
  if (errs.length) return json({ error: errs.join(" ") }, 400, env);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ins = await env.DB.prepare(`INSERT INTO horses (name, barn_name, breed, breed_other, color, color_other, sex, dob, height, markings, microchip, brand, location, allow_public, optional_covenants, owner_name, owner_email, owner_signature, owner_signed_at, owner_ip)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(d.name, d.barn_name, d.breed, d.breed_other, d.color, d.color_other, d.sex, d.dob, d.height, d.markings, d.microchip, d.brand, d.location, d.allow_public, optional.join(","), d.owner_name, d.owner_email, d.signature, nowIso(), ip).run();
  const id = ins.meta.last_row_id;
  const reg = regNo(id);
  const keys = {};
  for (const [k, file] of photos) {
    const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const key = `h/${id}/${k}-${uuid().slice(0, 8)}.${ext}`;
    await env.PHOTOS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    keys[k] = key;
  }
  const prior = await env.DB.prepare("SELECT COUNT(*) AS n FROM horses WHERE owner_email = ? AND status = 'recorded'").bind(d.owner_email).first();
  const cents = prior && prior.n > 0 ? RECORD_ADDITIONAL_CENTS : RECORD_FIRST_CENTS;
  const session = await createCheckout(env, {
    name: `Registrum Recording Offering — ${d.name} (${reg})`, cents, email: d.owner_email, ref: "H" + id,
    metadata: { kind: "record", horse_id: id, reg_no: reg },
    successUrl: env.SITE_URL + "/thank-you.html?sid={CHECKOUT_SESSION_ID}",
    cancelUrl: env.SITE_URL + "/record.html?canceled=" + reg,
  });
  await env.DB.prepare("UPDATE horses SET reg_no=?, photo1=?, photo2=?, offering_cents=?, stripe_session=? WHERE id=?").bind(reg, keys.photo1 || null, keys.photo2 || null, cents, session.id, id).run();
  return json({ url: session.url, reg_no: reg }, 200, env);
}

async function handleAddCovenant(request, env, ctx) {
  const b = await request.json().catch(() => ({}));
  const email = lowerEmail(b.email);
  const sig = clean(b.signature, 120);
  const nums = (Array.isArray(b.covs) ? b.covs : []).map((x) => parseInt(x, 10)).filter((n) => OPTIONAL.includes(n));
  if (!nums.length) return json({ error: "Choose at least one covenant to add." }, 400, env);
  if (b.agree !== true && b.agree !== "yes") return json({ error: "Please check the box to accept the covenants." }, 400, env);
  if (sig.length < 3) return json({ error: "Please type your full legal name to sign." }, 400, env);
  const h = await horseByReg(env, b.reg_no);
  if (!h || h.status !== "recorded" || h.owner_email !== email) return json({ error: "That Horse ID and email address don't match a recorded horse. Use the email address on file for the horse." }, 400, env);
  const existing = covList(h.optional_covenants);
  const added = nums.filter((n) => !existing.includes(n));
  if (!added.length) return json({ error: "Those covenants are already attached to this horse." }, 400, env);
  const merged = [...existing, ...added].sort((a, b2) => a - b2);
  const stmts = [env.DB.prepare("UPDATE horses SET optional_covenants=? WHERE id=?").bind(merged.join(","), h.id)];
  for (const n of added) stmts.push(env.DB.prepare("INSERT INTO covenant_log (horse_id, covenant_no, added_by_name, added_by_email, signature) VALUES (?,?,?,?,?)").bind(h.id, n, h.owner_name, email, sig));
  await env.DB.batch(stmts);
  await queueMail(env, ctx, [email], `Covenants added — ${h.name} (${h.reg_no})`,
    `<p>Dear ${esc(h.owner_name)},</p><p>The following covenants are now permanently attached to <strong>${esc(h.name)}</strong> (${esc(h.reg_no)}), signed by ${esc(sig)} on ${esc(fmtDate(nowIso()))}:</p>${covenantsHtml(added)}${btn(env.SITE_URL + "/horse.html?id=" + h.reg_no, "View the Record")}`);
  return json({ ok: true, added }, 200, env);
}

async function handleTransferRequest(request, env, ctx) {
  const b = await request.json().catch(() => ({}));
  const curEmail = lowerEmail(b.current_owner_email);
  const newEmail = lowerEmail(b.new_owner_email);
  const newName = clean(b.new_owner_name, 120);
  const type = TRANSFER_TYPES.includes(b.transfer_type) ? b.transfer_type : "Other";
  if (!newName || !isEmail(newEmail) || !isEmail(curEmail)) return json({ error: "Please fill in every field with a valid email address." }, 400, env);
  if (newEmail === curEmail) return json({ error: "The new owner's email must be different from the current owner's email." }, 400, env);
  const h = await horseByReg(env, b.reg_no);
  // Same response whether or not it matches, so emails on file can't be guessed.
  if (h && h.status === "recorded" && h.owner_email === curEmail) {
    await env.DB.prepare("UPDATE transfers SET status='canceled' WHERE horse_id=? AND status IN ('awaiting_owner','approved')").bind(h.id).run();
    const token = uuid();
    await env.DB.prepare("INSERT INTO transfers (horse_id, transfer_type, prev_owner_name, prev_owner_email, new_owner_name, new_owner_email, approve_token) VALUES (?,?,?,?,?,?,?)")
      .bind(h.id, type, h.owner_name, h.owner_email, newName, newEmail, token).run();
    const base = env.WORKER_URL + "/t/" + token;
    await queueMail(env, ctx, [h.owner_email], `Did you agree to transfer ${h.name} (${h.reg_no})?`,
      `<p>Dear ${esc(h.owner_name)},</p><p><strong>${esc(newName)}</strong> (${esc(newEmail)}) has asked to become the registered owner of <strong>${esc(h.name)}</strong> (${esc(h.reg_no)}) by ${esc(type.toLowerCase())}.</p>
<p>Did you agree to this transfer? Nothing changes unless you approve.</p>${btn(base + "?a=approve", "Approve Transfer")}${btn(base + "?a=decline", "Decline")}
<p style="font-size:13px;color:#6b5a7d">If you approve, the new owner must accept the horse's covenants and sign before the transfer is completed. If you did not agree to this, click Decline or ignore this email.</p>`);
  }
  return json({ ok: true }, 200, env);
}

async function approvePage(env, token, action) {
  const t = await env.DB.prepare("SELECT t.*, h.name AS horse_name, h.reg_no FROM transfers t JOIN horses h ON h.id=t.horse_id WHERE approve_token=?").bind(token).first();
  if (!t || t.status !== "awaiting_owner") return html(page("Link expired", `<h1>This link is no longer active</h1><p>This transfer request has already been answered or has expired. If you need help, write to info@horseschurch.org.</p>`));
  const approve = action === "approve";
  return html(page("Confirm your response", `<h1>Confirm Your Response</h1>
<p>You chose to <span class="a">${approve ? "approve" : "decline"}</span> the transfer of <strong>${esc(t.horse_name)}</strong> (${esc(t.reg_no)}) to <strong>${esc(t.new_owner_name)}</strong>.</p>
<form method="post" action="${esc(env.WORKER_URL)}/t/${esc(token)}"><input type="hidden" name="a" value="${approve ? "approve" : "decline"}">
${approve ? `<label class="chk"><input type="checkbox" name="sc" value="yes" required> I confirm I am the owner of the Horse, I am transferring it only through the America's Equines registry, and the new owner must accept the Covenants before I hand over the Horse.</label>` : ""}
<p class="small">Nothing changes until you press the button below.</p><button type="submit">Confirm</button></form>`));
}

async function approvePost(request, env, ctx, token) {
  const f = await request.formData();
  const a = f.get("a");
  const t = await env.DB.prepare("SELECT * FROM transfers WHERE approve_token=?").bind(token).first();
  if (!t || t.status !== "awaiting_owner") return approvePage(env, token, a);
  const h = await env.DB.prepare("SELECT * FROM horses WHERE id=?").bind(t.horse_id).first();
  if (a === "approve") {
    if (f.get("sc") !== "yes") return html(page("Confirmation needed", `<h1>Please confirm</h1><p>Please go back and check the confirmation box to approve the transfer.</p>`), 400);
    const st = uuid();
    const r = await env.DB.prepare("UPDATE transfers SET status='approved', seller_confirmed=1, approved_at=?, sign_token=? WHERE id=? AND status='awaiting_owner'").bind(nowIso(), st, t.id).run();
    if (r.meta.changes) {
      const nums = allCovNums(h);
      await queueMail(env, ctx, [t.new_owner_email], `Sign to complete your transfer — ${h.name} (${h.reg_no})`,
        `<p>Dear ${esc(t.new_owner_name)},</p><p>${esc(h.owner_name)} has approved the transfer of <strong>${esc(h.name)}</strong> (${esc(h.reg_no)}) to you.</p>
<p>Before ownership passes to you, you must read and accept the covenants attached to this horse. They are shown in full below. Then use the button to sign and make the $10 transfer offering.</p>${btn(env.WORKER_URL + "/sign/" + st, "Review, Sign & Complete Transfer")}
<div style="background:#F7F1E1;border:1px solid #e6dcc2;padding:14px 18px;font-size:14px"><p>${esc(agreementIntro(h))}</p><p><strong>Covenants</strong></p>${covenantsHtml(nums)}<p><strong>Enforcement Terms</strong></p>${enforcementHtml()}</div>
<p style="font-size:13px;color:#6b5a7d">The transfer is not complete until you sign on the page linked above and the offering is received.</p>`);
    }
    return html(page("Transfer approved", `<h1>Thank you</h1><p>You approved the transfer of <strong>${esc(h.name)}</strong>. The new owner has been emailed and must accept the covenants and sign before the transfer is completed. You'll receive a copy of the signed agreement.</p>`));
  }
  await env.DB.prepare("UPDATE transfers SET status='declined' WHERE id=? AND status='awaiting_owner'").bind(t.id).run();
  await queueMail(env, ctx, [t.new_owner_email], `Transfer declined — ${h.name} (${h.reg_no})`,
    `<p>Dear ${esc(t.new_owner_name)},</p><p>The current owner of <strong>${esc(h.name)}</strong> (${esc(h.reg_no)}) declined the transfer request. The horse's record has not changed. If you believe this is a mistake, please contact the current owner directly.</p>`);
  return html(page("Transfer declined", `<h1>Transfer declined</h1><p>Nothing has changed. <strong>${esc(h.name)}</strong> remains registered to you.</p>`));
}

async function signPage(env, token, msg) {
  if (!isToken(token)) return html(page("Not found", "<h1>Link not found</h1>"), 404);
  const t = await env.DB.prepare("SELECT * FROM transfers WHERE sign_token=?").bind(token).first();
  if (!t || !["approved", "signed"].includes(t.status)) return html(page("Link expired", `<h1>This link is no longer active</h1><p>This transfer has already been completed, canceled, or has expired.</p>`));
  const h = await env.DB.prepare("SELECT * FROM horses WHERE id=?").bind(t.horse_id).first();
  if (t.status === "signed") {
    return html(page("Agreement signed", `<h1>Agreement signed</h1><p>You signed this agreement as <strong>${esc(t.signed_name)}</strong> on ${esc(fmtDate(t.signed_at))}. To finish, make the $10 transfer offering.</p>
<form method="post" action="${esc(env.WORKER_URL)}/sign/${esc(token)}"><input type="hidden" name="resume" value="1"><button type="submit">Continue to Payment</button></form>`));
  }
  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", dateStyle: "long" });
  return html(page("Transfer of Ownership Agreement", `<h1>Transfer of Ownership Agreement</h1>
${msg ? `<p style="color:#9b1c1c"><strong>${esc(msg)}</strong></p>` : ""}
<p>${esc(agreementIntro(h))}</p>
<h2>Covenants attached to ${esc(h.name)}</h2><div class="cov">${covenantsHtml(allCovNums(h))}</div>
<h2>Enforcement Terms</h2><div class="cov">${enforcementHtml()}</div>
<p class="small">These are part of the <a href="${esc(env.SITE_URL)}/terms.html" target="_blank">Registry Terms</a>.</p>
<form method="post" action="${esc(env.WORKER_URL)}/sign/${esc(token)}" id="f">
<label class="chk"><input type="checkbox" name="agree" value="yes" id="agree"> I have read the Covenants above. I agree to be bound by them as owner of the Horse, and I understand they will follow the Horse to every future owner.</label>
<p><label for="nm"><strong>Type your full legal name to sign:</strong></label><br><input type="text" name="name" id="nm" autocomplete="name" maxlength="120"></p>
<p class="small">Date: ${esc(today)}</p>
<p class="small">By clicking "I Agree – Pay $10 and Transfer" you are signing this Agreement electronically, you agree to all of the Covenants above and to the Church's Registry Terms, and you confirm you are at least 18 years old. Your electronic signature has the same legal effect as a handwritten one.</p>
<button type="submit" id="go" disabled>I Agree – Pay $10 and Transfer</button></form>
<script>const a=document.getElementById('agree'),n=document.getElementById('nm'),g=document.getElementById('go');function u(){g.disabled=!(a.checked&&n.value.trim().length>=3)}a.addEventListener('change',u);n.addEventListener('input',u);</script>`));
}

async function signPost(request, env, token) {
  if (!isToken(token)) return html(page("Not found", "<h1>Link not found</h1>"), 404);
  const f = await request.formData();
  let t = await env.DB.prepare("SELECT * FROM transfers WHERE sign_token=?").bind(token).first();
  if (!t || !["approved", "signed"].includes(t.status)) return signPage(env, token);
  const h = await env.DB.prepare("SELECT * FROM horses WHERE id=?").bind(t.horse_id).first();
  if (t.status === "approved") {
    const name = clean(f.get("name"), 120);
    if (f.get("agree") !== "yes" || name.length < 3) return signPage(env, token, "Please check the box and type your full legal name to sign.");
    const signedAt = nowIso();
    const snapshot = `${agreementIntro(h)}\n\nCOVENANTS\n\n${covenantsText(allCovNums(h))}\n\nENFORCEMENT TERMS\n\n${enforcementText()}\n\nI have read the Covenants above. I agree to be bound by them as owner of the Horse, and I understand they will follow the Horse to every future owner. [checked]\n\nBy clicking "I Agree – Pay $10 and Transfer" I signed this Agreement electronically, agreed to all of the Covenants above and to the Church's Registry Terms, and confirmed I am at least 18 years old.\n\nSigned: ${name}\nDate: ${fmtDate(signedAt)}\nNew owner email: ${t.new_owner_email}\nPrevious owner: ${t.prev_owner_name} (${t.prev_owner_email})\nTransfer ID: T-${t.id}`;
    await env.DB.prepare("UPDATE transfers SET status='signed', signed_name=?, signed_at=?, signed_ip=?, signed_agent=?, agreement_snapshot=? WHERE id=? AND status='approved'")
      .bind(name, signedAt, request.headers.get("CF-Connecting-IP") || "", clean(request.headers.get("User-Agent"), 300), snapshot, t.id).run();
  }
  const session = await createCheckout(env, {
    name: `Registrum Transfer Offering — ${h.name} (${h.reg_no})`, cents: TRANSFER_CENTS, email: t.new_owner_email, ref: "T" + t.id,
    metadata: { kind: "transfer", transfer_id: t.id, reg_no: h.reg_no },
    successUrl: env.SITE_URL + "/thank-you.html?sid={CHECKOUT_SESSION_ID}",
    cancelUrl: env.WORKER_URL + "/sign/" + token,
  });
  await env.DB.prepare("UPDATE transfers SET stripe_session=? WHERE id=?").bind(session.id, t.id).run();
  return Response.redirect(session.url, 303);
}

async function handleConfirm(env, ctx, sid) {
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sid || "")) return json({ error: "Invalid session" }, 400, env);
  const s = await stripe(env, "GET", "checkout/sessions/" + sid);
  const r = await finalizeSession(env, ctx, s);
  return json(r.ok ? r : { ok: false, pending: true }, 200, env);
}

async function reconcile(env, ctx) {
  const since = new Date(Date.now() - 48 * 3600e3).toISOString();
  const hs = await env.DB.prepare("SELECT stripe_session FROM horses WHERE status='pending_payment' AND stripe_session IS NOT NULL AND created_at > datetime('now','-2 days')").all();
  const ts = await env.DB.prepare("SELECT stripe_session FROM transfers WHERE status='signed' AND stripe_session IS NOT NULL AND signed_at > ?").bind(since).all();
  for (const row of [...hs.results, ...ts.results]) {
    try { await finalizeSession(env, ctx, await stripe(env, "GET", "checkout/sessions/" + row.stripe_session)); } catch (e) {}
  }
  // Clean up unpaid recordings older than 7 days (and their photos), and old sent mail.
  const old = await env.DB.prepare("SELECT id, photo1, photo2 FROM horses WHERE status='pending_payment' AND created_at < datetime('now','-7 days')").all();
  for (const h of old.results) {
    for (const k of [h.photo1, h.photo2]) if (k) await env.PHOTOS.delete(k);
    await env.DB.prepare("DELETE FROM horses WHERE id=? AND status='pending_payment'").bind(h.id).run();
  }
  await env.DB.prepare("DELETE FROM mail WHERE created_at < datetime('now','-30 days')").run();
}

// ---------- admin (password protected) ----------
function adminAuth(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Basic ")) return false;
  const [u, p] = atob(h.slice(6)).split(":");
  return u === "admin" && p === env.ADMIN_PASSWORD;
}
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
async function adminCsv(env, table) {
  const allowed = { horses: "SELECT * FROM horses ORDER BY id", transfers: "SELECT * FROM transfers ORDER BY id", ownership: "SELECT * FROM ownership ORDER BY horse_id, id", covenants: "SELECT * FROM covenant_log ORDER BY id" };
  if (!allowed[table]) return new Response("Unknown table", { status: 400 });
  const { results } = await env.DB.prepare(allowed[table]).all();
  const cols = results.length ? Object.keys(results[0]) : [];
  const body = "﻿" + [cols.join(","), ...results.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="registrum-${table}.csv"` } });
}
async function adminPage(env) {
  const hs = (await env.DB.prepare("SELECT id, reg_no, name, owner_name, owner_email, status, offering_cents, paid_at, created_at FROM horses ORDER BY id DESC LIMIT 200").all()).results;
  const ts = (await env.DB.prepare("SELECT t.id, h.reg_no, t.prev_owner_email, t.new_owner_name, t.new_owner_email, t.status, t.signed_name, t.created_at FROM transfers t JOIN horses h ON h.id=t.horse_id ORDER BY t.id DESC LIMIT 200").all()).results;
  const table = (rows) => rows.length ? `<table style="border-collapse:collapse;font-size:14px;width:100%"><tr>${Object.keys(rows[0]).map((k) => `<th style="text-align:left;border-bottom:2px solid #C9A227;padding:6px">${esc(k)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${Object.values(r).map((v) => `<td style="border-bottom:1px solid #e6dcc2;padding:6px">${esc(v)}</td>`).join("")}</tr>`).join("")}</table>` : "<p>None yet.</p>";
  return html(page("Registrum Admin", `<h1>Registrum Admin</h1><p>Download for Excel: <a href="/admin/export/horses">Horses</a> · <a href="/admin/export/transfers">Transfers</a> · <a href="/admin/export/ownership">Ownership history</a> · <a href="/admin/export/covenants">Added covenants</a></p><h2>Horses</h2>${table(hs)}<h2>Transfers</h2>${table(ts)}`).replace("max-width:760px", "max-width:1200px"));
}

// ---------- router ----------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });
      if (p === "/api/covenants") return json({ covenants: COVENANTS.map(([t, x], i) => ({ no: i + 1, title: t, text: x, core: CORE.includes(i + 1) })), enforcement: ENFORCEMENT.map(([t, x]) => ({ title: t, text: x })), transfer_types: TRANSFER_TYPES }, 200, env);
      if (p === "/api/horses" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM horses WHERE status='recorded' AND allow_public=1 ORDER BY id DESC LIMIT 1000").all();
        return json({ horses: results.map((h) => publicHorse(env, h, false)) }, 200, env);
      }
      let m = /^\/api\/horses\/(HR-\d{1,7})$/i.exec(p);
      if (m && request.method === "GET") {
        const h = await horseByReg(env, m[1]);
        if (!h || h.status !== "recorded") return json({ error: "No recorded horse with that Registrum ID." }, 404, env);
        return json({ horse: publicHorse(env, h, true) }, 200, env);
      }
      if (p === "/api/record" && request.method === "POST") return await handleRecord(request, env);
      if (p === "/api/covenants/add" && request.method === "POST") return await handleAddCovenant(request, env, ctx);
      if (p === "/api/transfer" && request.method === "POST") return await handleTransferRequest(request, env, ctx);
      if (p === "/api/confirm") return await handleConfirm(env, ctx, url.searchParams.get("sid"));
      m = /^\/photo\/(h\/\d+\/[A-Za-z0-9._-]+)$/.exec(p);
      if (m) {
        const obj = await env.PHOTOS.get(m[1]);
        if (!obj) return new Response("Not found", { status: 404 });
        return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=604800" } });
      }
      m = /^\/t\/([0-9a-f-]{36})$/.exec(p);
      if (m) return request.method === "POST" ? await approvePost(request, env, ctx, m[1]) : await approvePage(env, m[1], url.searchParams.get("a"));
      m = /^\/sign\/([0-9a-f-]{36})$/.exec(p);
      if (m) return request.method === "POST" ? await signPost(request, env, m[1]) : await signPage(env, m[1]);
      m = /^\/mail\/([0-9a-f-]{36})(\/sent)?$/.exec(p);
      if (m) {
        const row = await env.DB.prepare("SELECT * FROM mail WHERE id=? AND sent=0 AND created_at > datetime('now','-2 hours')").bind(m[1]).first();
        if (!row) return json({ error: "not found" }, 404, env);
        if (m[2] || request.method === "POST") { await env.DB.prepare("UPDATE mail SET sent=1 WHERE id=?").bind(m[1]).run(); return json({ ok: true }, 200, env); }
        return json({ to: row.to_list, subject: row.subject, html: row.html }, 200, env);
      }
      if (p.startsWith("/admin")) {
        if (!adminAuth(request, env)) return new Response("Login required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Registrum Admin"' } });
        m = /^\/admin\/export\/(\w+)$/.exec(p);
        if (m) return await adminCsv(env, m[1]);
        return await adminPage(env);
      }
      if (p === "/") return Response.redirect(env.SITE_URL, 302);
      return json({ error: "Not found" }, 404, env);
    } catch (e) {
      return json({ error: "Something went wrong. Please try again, or write to info@horseschurch.org." , detail: String(e.message || e).slice(0, 200) }, 500, env);
    }
  },
  async scheduled(event, env, ctx) {
    await reconcile(env, ctx);
  },
};
