// Uso:  node update.mjs --dry   (muestra qué cambiaría, no escribe nada)
//       node update.mjs         (actualiza data.js)
// Sin dependencias ni API keys. Necesita Node 18+.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

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
  if (!r.ok) throw new Error(`${r.status} ${url.replace(/key=[^&]+/, 'key=***')}`); // el log va a un PR público: nunca la clave
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

// 1) videos nuevos del canal: lo que esté por ENCIMA del video más nuevo que ya tenemos.
//    Fuente 1: la página del canal (no trae Shorts). Fuente 2: el feed RSS, que YouTube a veces devuelve 404.
const channelVideos = async () => {
  try {
    const html = await get(`https://www.youtube.com/channel/${CHANNEL}/videos`);
    const out = [];
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (o.lockupViewModel?.contentId) out.push({ id: o.lockupViewModel.contentId, t: o.lockupViewModel.metadata?.lockupMetadataViewModel?.title?.content ?? '' });
      Object.values(o).forEach(walk);
    })(JSON.parse(html.match(/var ytInitialData = (\{.*?\});<\/script>/)[1]));
    if (out.length) return out; // más nuevo primero
  } catch {}
  const feed = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`);
  return [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => ({ id: tag(m[1], 'yt:videoId'), t: text(tag(m[1], 'title')) })).filter(v => !v.t.includes('#')); // el feed mezcla Shorts
};
// Portada oficial en HD (1000x1000) y link del single en Deezer: API pública, sin clave. null si todavía no está en Deezer.
const DEEZER_ARTIST = 95873492;
const deezer = async t => {
  const j = JSON.parse(await get(`https://api.deezer.com/artist/${DEEZER_ARTIST}/albums?limit=25`).catch(() => '{}'));
  return (j.data || []).find(a => norm(a.title) === norm(t)) ?? null;
};
// Slide de "Lo último" para un video nuevo: portada HD del video (maxres), fecha y duración, y la portada oficial del single.
// Los fotogramas de YouTube (hq1..3) son de 480x360 y se ven mal: no se usan. Para más fotos o clips en HD, se editan a mano en data.js.
const release = async (id, t) => {
  const html = await get(`https://www.youtube.com/watch?v=${id}`).catch(() => '');
  const [, y, m, d] = html.match(/"publishDate":"(\d{4})-(\d\d)-(\d\d)/) || [];
  const secs = +html.match(/"lengthSeconds":"(\d+)"/)?.[1];
  const dz = await deezer(t);
  return {
    id, t, date: y ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10), accent: '#ff3b3b',
    facts: [y && [`${d}.${m}.${y}`, 'Estreno del video oficial'], secs && [`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 'Duración del video']].filter(Boolean),
    ...(dz && { listen: dz.link }),
    cover: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, coverAlt: `Portada de ${t}`,
    reel: dz ? [{ i: dz.cover_xl, a: `Portada oficial de ${t}` }] : [],
  };
};
D.releases ??= [];
await step('videos nuevos', async () => {
  const known = new Set(D.videos.map(v => v.id));
  const all = await channelVideos();
  const at = all.findIndex(v => known.has(v.id));
  const fresh = (at < 0 ? all : all.slice(0, at)).slice(0, 3); // tope: si no reconoce ninguno, no mete todo el canal
  for (const v of fresh.reverse()) {
    const t = v.t.replace(/^Dei V\s*[-–]\s*/, '').replace(/\s*[(\[](Video Oficial|Official Video|Official Visualizer|Visualizer)[)\]]/i, '');
    D.videos.unshift({ id: v.id, t, m: 'nuevo' });
    log.push(`+ video: ${v.t}`);
    if (!D.releases.some(r => r.id === v.id)) { D.releases.unshift(await release(v.id, t)); log.push(`+ slide "Lo último": ${t}`); }
  }
  D.videos.splice(MAX_VIDEOS); // las vistas las completa el paso siguiente
  D.releases.splice(3); // el slider muestra los 3 estrenos más nuevos
});

// 1b) Instagram: el embed público del perfil (el que Instagram ofrece a los sitios) trae el código y el texto de las últimas
//     publicaciones, sin login ni claves. Si el texto nombra el tema, esa publicación se suma al slide de ese estreno.
//     Solo cuentas públicas, una consulta por corrida. Si Instagram cambia el formato o bloquea, el log avisa y el resto sigue.
const IG_USER = 'deivpr';
const words = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean).join(' ');
const mentions = (caption, title) => !!words(title) && ` ${words(caption)} `.includes(` ${words(title)} `); // palabra entera: "emo" no matchea "tema"
const decode = s => { try { return JSON.parse(`"${JSON.parse(`"${s}"`)}"`); } catch { return s; } }; // el texto viene escapado dos veces
// Las fotos salen del mismo embed (hasta 1080 px) y se guardan en assets/ig: los links de Instagram vencen a los pocos días.
// El video en sí NO viene en esos datos: su imagen de portada lleva un ▶ que abre el reproductor oficial de Instagram.
const MAX_IG_IMAGES = 8; // por estreno, entre todas sus publicaciones
const IMG_DIR = new URL('./assets/ig/', import.meta.url);
await step('instagram', async () => {
  const html = (await get(`https://www.instagram.com/${IG_USER}/embed/`)).replace(/\\"/g, '"');
  const codes = [...html.matchAll(/"shortcode":"([\w-]+)"/g)];
  const nodes = codes.map((m, i) => { // cada nodo va de su código al del siguiente: ahí están su texto, su tipo y sus tamaños de imagen
    const chunk = html.slice(m.index, codes[i + 1]?.index ?? html.length);
    const cap = chunk.match(/"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"((?:[^"\\]|\\.)*)"/)?.[1];
    const best = [...chunk.matchAll(/"config_width":(\d+),"config_height":(\d+),"src":"((?:[^"\\]|\\.)*)"/g)].sort((a, b) => b[1] - a[1])[0];
    return { sc: m[1], cap: cap && decode(cap), video: /"is_video":true/.test(chunk), url: best && decode(best[3]) };
  });
  // publicación = nodo con texto; las fotos/videos de un carrusel son los nodos sin texto que le siguen
  const posts = nodes.flatMap((n, i) => {
    if (!n.cap) return [];
    const kids = []; for (let j = i + 1; j < nodes.length && !nodes[j].cap; j++) kids.push(nodes[j]);
    return [{ ...n, items: kids.length ? kids : [n] }];
  });
  if (!posts.length) throw new Error('no encontré publicaciones (¿cambió el formato del embed?)');
  for (const r of D.releases) {
    if (r.reel?.some(x => x.ig)) continue;
    const imgs = [];
    for (const p of posts.filter(p => mentions(p.cap, r.t)).slice(0, 2)) { // hasta 2 publicaciones que nombran el tema, la más nueva primero
      for (const it of p.items) {
        if (imgs.length >= MAX_IG_IMAGES || !it.url) continue;
        const res = await fetch(it.url).catch(() => null);
        if (!res?.ok) continue;
        if (!DRY) { mkdirSync(IMG_DIR, { recursive: true }); writeFileSync(new URL(`${it.sc}.jpg`, IMG_DIR), Buffer.from(await res.arrayBuffer())); }
        imgs.push({ i: `assets/ig/${it.sc}.jpg`, a: `Publicación de @${IG_USER} sobre ${r.t}`, ig: p.sc, ...(it.video && { play: true }) });
      }
    }
    if (imgs.length) { (r.reel ??= []).unshift(...imgs); log.push(`+ instagram: ${imgs.length} imágenes para "${r.t}"`); }
  }
});

// 2) vistas al día (videos y los números de la sección "Números" que tienen yt)
await step('vistas', async () => {
  const ids = [...new Set([...D.videos.map(v => v.id), ...D.nums.filter(n => n.yt).map(n => n.yt)])];
  const counts = {};
  if (process.env.YT_API_KEY) {
    // API oficial de YouTube (key gratis): una sola llamada y no depende de que YouTube nos deje scrapear
    const j = JSON.parse(await get(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.join(',')}&key=${process.env.YT_API_KEY}`));
    for (const i of j.items) counts[i.id] = +i.statistics.viewCount;
  } else {
    for (const id of ids) counts[id] = +(await get(`https://www.youtube.com/watch?v=${id}`).catch(() => '')).match(/"viewCount":"(\d+)"/)?.[1] || 0;
  }
  const missing = ids.filter(id => !counts[id]);
  if (missing.length) log.push(`! vistas: no pude leer ${missing.length} de ${ids.length} videos${process.env.YT_API_KEY ? '' : ' (YouTube bloquea los servidores; usá YT_API_KEY)'}`);
  for (const v of D.videos) {
    const n = counts[v.id];
    if (n && n !== v.views) { log.push(`~ ${v.t}: ${v.views ?? 0} → ${n}`); v.views = n; }
  }
  for (const n of D.nums.filter(n => n.yt)) {
    const m = Math.floor((counts[n.yt] || 0) / 1e6);
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
      // descarta lo que no nombra a Dei V en el título, estafas, páginas de venta de entradas y videos subidos por cualquiera ("YouTube")
      if (!/\bDei V\b/.test(title) || /estafa|estafad|\bentradas dei v\b/i.test(title) || source === 'YouTube' || isNaN(d)) continue;
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
