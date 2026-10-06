// Actions réservées aux administrateurs : le code est vérifié ICI, côté serveur
// --- Accès à la base Upstash Redis (connectée via Vercel), sans dépendance ---
const BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function send(path, body) {
  if (!BASE || !TOKEN) throw new Error("Base de données non connectée (variables KV_REST_API_URL et KV_REST_API_TOKEN manquantes)");
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}
async function redis(cmd) { const j = await send("", cmd); if (j.error) throw new Error(j.error); return j.result; }
async function pipeline(cmds) { const j = await send("/pipeline", cmds); return j.map(x => { if (x.error) throw new Error(x.error); return x.result; }); }
const H = "cdx:demandes", CH = "cdx:chat";
const roleDe = c => c === (process.env.ADMIN_PRINCIPAL_CODE || "JUNIOR01") ? "principal"
  : c === (process.env.ADMIN_CODE || "JUNIOR") ? "admin" : null;
const clean = (v, n) => String(v ?? "").trim().slice(0, n);
const pos = v => Number.isInteger(v) && v >= 0 && v < 1e9;
async function lire(id) { const j = await redis(["HGET", H, id]); return j ? JSON.parse(j) : null; }
const ecrire = d => redis(["HSET", H, d.id, JSON.stringify(d)]);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  const b = req.body || {};
  const role = roleDe(String(b.code || ""));
  if (!role) { await new Promise(s => setTimeout(s, 700)); return res.status(401).json({ error: "Code erroné" }); }
  try {
    switch (b.action) {
      case "login": return res.json({ role });
      case "list": {
        const v = await redis(["HVALS", H]);
        return res.json({ demandes: (v || []).map(x => JSON.parse(x)) });
      }
      case "decide": {
        const d = await lire(clean(b.id, 12)); if (!d) return res.status(404).json({ error: "Élève introuvable" });
        d.statut = "rejete"; await ecrire(d); return res.json({ ok: true });
      }
      case "approve": {
        const d = await lire(clean(b.id, 12)); if (!d) return res.status(404).json({ error: "Élève introuvable" });
        const { pc, pi, aura, rangIndividuel, rangClasse } = b;
        if (![pc, pi, aura, rangIndividuel].every(pos) || !["A", "B", "C", "D"].includes(rangClasse))
          return res.status(400).json({ error: "Valeurs invalides" });
        Object.assign(d, { statut: "approuve", pc, pi, aura, rangIndividuel, rangClasse });
        await ecrire(d); return res.json({ ok: true });
      }
      case "adjust": {
        const d = await lire(clean(b.id, 12)); if (!d) return res.status(404).json({ error: "Élève introuvable" });
        if (!["pc", "pi", "aura"].includes(b.champ) || !Number.isInteger(b.delta) || Math.abs(b.delta) >= 1e9)
          return res.status(400).json({ error: "Valeurs invalides" });
        const n = (d[b.champ] || 0) + b.delta;
        if (n < 0) return res.status(400).json({ error: "Les points ne peuvent pas passer sous 0." });
        d[b.champ] = n; await ecrire(d); return res.json({ ok: true, valeur: n });
      }
      case "chat_list": {
        const v = await redis(["LRANGE", CH, 0, 99]);
        return res.json({ messages: (v || []).map(x => JSON.parse(x)).reverse() });
      }
      case "chat_send": {
        const nom = clean(b.nom, 20), texte = clean(b.texte, 400);
        if (!nom || !texte) return res.status(400).json({ error: "Message vide" });
        await pipeline([["LPUSH", CH, JSON.stringify({ nom, role, texte, date: Date.now() })], ["LTRIM", CH, 0, 99]]);
        return res.json({ ok: true });
      }
      default: return res.status(400).json({ error: "Action inconnue" });
    }
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
