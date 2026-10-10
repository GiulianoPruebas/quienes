// Uso:  node update.mjs --dry   (muestra qué cambiaría, no escribe nada)
//       node update.mjs         (actualiza data.js)
// Sin dependencias ni API keys. Necesita Node 18+.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./data.js', import.meta.url);
const DRY = process.argv.includes('--dry');
const CHANNEL = 'UCiiB0KbPaRw8VpbP72U6Llg'; // canal oficial de Dei V
const MAX_VIDEOS = 16; // el grid de la web
const MAX_NEW_PRESS = 15; // por corrida, para que la primera vez no inunde la lista
const HEADER = '// Datos del sitio. Se pueden editar a mano; `node update.mjs` actualiza vistas, videos y notas.\n';

const raw = readFileSync(FILE, 'utf8');
const D = JSON.parse(raw.slice(raw.indexOf('{', raw.indexOf('window.DATA'))).replace(/;\s*$/, ''));
const log = [];

const get = async url => {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', cookie: 'CONSENT=YES+1; SOCS=CAI' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};
// una fuente caída no frena a las otras
const step = async (name, fn) => { try { await fn(); } catch (e) { log.push(`! ${name} falló: ${e.message}`); } };
const tag = (s, t) => (s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [, ''])[1];
const text = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const norm = s => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const kind = t =>
  /entrevista|interview|habla|cuenta|confiesa/i.test(t) ? 'entrevista'
  : /concierto|gira|tour|show|escenario|estadio|arena|festival|en vivo|live|despidi/i.test(t) ? 'show'
  : /lanza|estrena|álbum|album|sencillo|single|tema|v[ií]deo|colabora|se unen|revolucionan/i.test(t) ? 'lanzamiento'
  : 'noticia';

// 1) videos nuevos del canal (el feed mezcla Shorts: se descartan los que tienen #hashtags)
await step('videos nuevos', async () => {
  const feed = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`);
  const known = new Set(D.videos.map(v => v.id));
  const fresh = [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1])
    .map(e => ({ id: tag(e, 'yt:videoId'), t: text(tag(e, 'title')), views: +(e.match(/statistics views="(\d+)"/) || [])[1] || 0 }))
    .filter(v => !v.t.includes('#') && !known.has(v.id));
  for (const v of fresh.reverse()) {
    D.videos.unshift({ id: v.id, t: v.t.replace(/^Dei V\s*[-–]\s*/, '').replace(/\s*\((Video Oficial|Official Video|Official Visualizer|Visualizer)\)/i, ''), m: 'nuevo', views: v.views });
    log.push(`+ video: ${v.t}`);
  }
  D.videos.splice(MAX_VIDEOS);
});

// 2) vistas al día (videos y los números de la sección "Números" que tienen yt)
await step('vistas', async () => {
  const cache = {};
  const views = async id => (cache[id] ??= +(await get(`https://www.youtube.com/watch?v=${id}`)).match(/"viewCount":"(\d+)"/)?.[1] || 0);
  for (const v of D.videos) {
    const n = await views(v.id).catch(() => 0);
    if (n && n !== v.views) { log.push(`~ ${v.t}: ${v.views ?? 0} → ${n}`); v.views = n; }
  }
  for (const n of D.nums.filter(n => n.yt)) {
    const m = Math.floor((await views(n.yt).catch(() => 0)) / 1e6);
    if (m > n.v) { log.push(`~ número "${n.l.slice(0, 40)}…": ${n.v}M → ${m}M`); n.v = m; }
  }
});

// 3) notas nuevas (Google News RSS). `seen` recuerda lo ya visto, así lo que borres a mano no vuelve.
await step('prensa', async () => {
  const queries = [
    ['"Dei V" (reggaeton OR trap OR "Bad Bunny" OR álbum OR concierto)', 'hl=es-419&gl=AR&ceid=AR:es-419'],
    ['"Dei V" (rapper OR album OR tour)', 'hl=en-US&gl=US&ceid=US:en'],
  ];
  const items = new Map();
  for (const [q, loc] of queries)
    for (const m of (await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${loc}`)).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const full = text(tag(m[1], 'title')), cut = full.lastIndexOf(' - ');
      const title = cut > 0 ? full.slice(0, cut) : full, source = text(tag(m[1], 'source')) || full.slice(cut + 3);
      const d = new Date(tag(m[1], 'pubDate'));
      // descarta lo que no nombra a Dei V en el título, y estafas / páginas de venta de entradas
      if (!/\bDei V\b/.test(title) || /estafa|estafad|\bentradas dei v\b/i.test(title) || isNaN(d)) continue;
      items.set(norm(source + title), { title, source, link: text(tag(m[1], 'link')), date: d.toISOString().slice(0, 7), when: +d });
    }
  const have = D.press.map(p => norm(p[2]).slice(0, 28));
  const cand = [...items.entries()].filter(([k, it]) => !D.seen.includes(k) && !have.includes(norm(it.title).slice(0, 28)))
    .sort((a, b) => b[1].when - a[1].when);
  const fresh = cand.slice(0, MAX_NEW_PRESS);
  const later = new Set(cand.slice(MAX_NEW_PRESS).map(([k]) => k)); // sobran por el tope: entran la próxima vez
  for (const [k, it] of fresh) {
    const row = [it.date, it.source, it.title, it.link, kind(it.title)];
    const at = D.press.findIndex(p => p[0] < it.date); // mantiene el orden más nuevo → más viejo
    D.press.splice(at < 0 ? D.press.length : at, 0, row);
    log.push(`+ nota: ${it.source} · ${it.title}`);
  }
  D.seen = [...new Set([...D.seen, ...[...items.keys()].filter(k => !later.has(k))])].slice(-500);
});

D.updated = new Date().toISOString().slice(0, 10);
const out = HEADER + 'window.DATA = {\n' + Object.entries(D).map(([k, v]) => Array.isArray(v)
  ? ` "${k}": [\n${v.map(i => '  ' + JSON.stringify(i)).join(',\n')}\n ]` : ` "${k}": ${JSON.stringify(v)}`).join(',\n') + '\n};\n';

console.log(log.length ? log.join('\n') : 'Sin cambios.');
if (DRY) console.log('\n(--dry: no se escribió nada)');
else { writeFileSync(FILE, out); console.log('\ndata.js actualizado. Revisá los cambios y subí el sitio.'); }
