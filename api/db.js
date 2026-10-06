// Accès à la base Upstash Redis (connectée via Vercel). Aucune dépendance.
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
module.exports = { redis, pipeline };
