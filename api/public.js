// Actions ouvertes à tous : inscription et consultation de son espace élève
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
const H = "cdx:demandes";
const clean = (v, n) => String(v ?? "").trim().slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const b = req.body || {};
    if (b.action === "register") {
      const d = b.data || {};
      const f = { nom: clean(d.nom, 60), numero: clean(d.numero, 30), description: clean(d.description, 500),
        classe: clean(d.classe, 30), rangClasse: clean(d.rangClasse, 1), poste: clean(d.poste, 20) };
      if (!f.nom || !f.numero || !f.classe) return res.status(400).json({ error: "Informations manquantes" });
      if (!["A", "B", "C", "D"].includes(f.rangClasse) || !["ÉLÈVE", "PROFESSEUR", "MEMBRE DU BDE"].includes(f.poste))
        return res.status(400).json({ error: "Rang ou poste invalide" });
      for (let i = 0; i < 30; i++) {
        const id = "CDX" + (1000 + Math.floor(Math.random() * 9000));
        const doc = { ...f, id, statut: "attente", pc: 0, pi: 0, aura: 0, rangIndividuel: 0, date: Date.now() };
        if ((await redis(["HSETNX", H, id, JSON.stringify(doc)])) === 1) return res.json({ id });
      }
      return res.status(500).json({ error: "Aucun identifiant disponible" });
    }
    if (b.action === "student") {
      const id = clean(b.id, 12).toUpperCase();
      if (!/^CDX\d{4}$/.test(id)) return res.json({ c: null });
      const raw = await redis(["HGET", H, id]);
      if (!raw) return res.json({ c: null });
      const d = JSON.parse(raw);
      if (d.statut !== "approuve") return res.json({ c: { statut: d.statut } });
      const { nom, classe, rangClasse, pc, pi, aura, rangIndividuel, statut } = d;
      return res.json({ c: { nom, classe, rangClasse, pc, pi, aura, rangIndividuel, statut } });
    }
    return res.status(400).json({ error: "Action inconnue" });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
