/* ===========================================================
   Life OS — Plaid bank sync (front end)

   Connect a bank once through Plaid's secure Link popup. The Worker
   exchanges it for a permanent access token, encrypts it, and hands the
   ciphertext back here — we keep it in localStorage (first-party, so it
   survives Safari) and replay it to the Worker whenever we need fresh
   numbers. Nothing sensitive is ever readable in the browser.
   =========================================================== */
window.LifeOSPlaid = (function () {
  const ITEMS_KEY = "lifeos-plaid-items";   // [{ item: <ciphertext>, institution }]
  const CACHE_KEY = "lifeos-money-cache";   // last good /plaid/data payload
  const BUDGET_KEY = "lifeos-money-budget"; // monthly budget number

  const base = () => (window.LIFEOS_CONFIG || {}).backendUrl || "";
  const configured = () => !!base();

  function load() {
    try { return JSON.parse(localStorage.getItem(ITEMS_KEY)) || []; } catch (e) { return []; }
  }
  function save(items) { localStorage.setItem(ITEMS_KEY, JSON.stringify(items)); }

  const hasItems = () => load().length > 0;
  const institutions = () => load().map((i) => i.institution).filter(Boolean);

  function budget() { return Number(localStorage.getItem(BUDGET_KEY)) || 1800; }
  function setBudget(n) { localStorage.setItem(BUDGET_KEY, String(Number(n) || 1800)); }

  function cache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; } }
  function setCache(d) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) {} }

  function loadLink() {
    return new Promise((res, rej) => {
      if (window.Plaid) return res();
      const s = document.createElement("script");
      s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
      s.onload = () => res();
      s.onerror = () => rej(new Error("Couldn't load Plaid"));
      document.head.appendChild(s);
    });
  }

  async function post(path, body) {
    const r = await fetch(base() + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    return r.json();
  }

  // Open the Plaid popup, connect one institution, store its encrypted token.
  async function connect() {
    if (!configured()) throw new Error("Backend not configured");
    await loadLink();
    const lt = await post("/plaid/link-token", {});
    if (!lt.link_token) throw new Error(lt.error || "Couldn't start Plaid");
    return new Promise((resolve, reject) => {
      const handler = window.Plaid.create({
        token: lt.link_token,
        onSuccess: async (public_token, metadata) => {
          try {
            const ex = await post("/plaid/exchange", { public_token });
            if (!ex.item) throw new Error(ex.error || "Connection failed");
            const items = load();
            items.push({
              item: ex.item,
              institution: ex.institution || (metadata && metadata.institution && metadata.institution.name) || "Bank",
            });
            save(items);
            resolve(items);
          } catch (e) { reject(e); }
        },
        onExit: (err) => { reject(Object.assign(err || {}, { cancelled: !err })); },
      });
      handler.open();
    });
  }

  // Pull fresh aggregated numbers for every connected item.
  async function fetchData() {
    const items = load();
    if (!items.length) return null;
    const data = await post("/plaid/data", { items: items.map((i) => i.item), budget: budget() });
    if (data.error) throw new Error(data.error);
    setCache(data);
    return data;
  }

  function disconnect() {
    localStorage.removeItem(ITEMS_KEY);
    localStorage.removeItem(CACHE_KEY);
  }

  return { configured, hasItems, institutions, budget, setBudget, connect, fetchData, cache, disconnect };
})();
