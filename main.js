(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => matchMedia('(max-width: 860px)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ---------- data ---------- */
  const { timeline: TIMELINE, videos: VIDEOS, quotes: QUOTES, press: PRESS, peek: PEEK, tiktoks: TIKTOKS, nums: NUMS, releases: RELEASES, updated: UPDATED } = window.DATA;
  const yt = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  // los títulos vienen de terceros (Google News, YouTube): se escapan antes de entrar al HTML
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = n =>(n >= 1e6 ? Math.floor(n / 1e6) + 'M' : n >= 1e3 ? Math.floor(n / 1e3) + 'K' : '' + n);

  /* ---------- build DOM from data ---------- */
  $('.nums').innerHTML = NUMS.map(n =>
    `<div class="num"><p class="num__v mono" data-count="${n.v}"${n.prefix ? ` data-prefix="${n.prefix}"` : ''}${n.suffix ? ` data-suffix="${n.suffix}"` : ''}>0</p><p>${n.l}</p></div>`
  ).join('');
  /* ---------- lo último: slider con los 3 estrenos más nuevos (data.js → releases) ---------- */
  const dmy = iso => iso.split('-').reverse().join('.');
  // r.ig = código de la publicación de Instagram de la que sale la imagen: lleva crédito con link y, si es un video (r.play), un ▶ que abre el reproductor oficial
  const igCode = c => /^[\w-]{5,20}$/.test(c || ''); // el código solo puede tener letras, números, - y _
  const reelItem = r => r.v
    ? `<figure><video src="${esc(r.v)}" poster="${esc(r.p || '')}" muted loop playsinline preload="none" data-autoplay></video></figure>`
    : `<figure><img src="${esc(r.i)}" alt="${esc(r.a || '')}" loading="lazy">${igCode(r.ig)
        ? `${r.play ? `<button class="ig-play" data-ig="${r.ig}" aria-label="Ver el video en Instagram"><span class="ig-play__icon" aria-hidden="true">▶</span></button>` : ''}<a class="ig-credit" href="https://www.instagram.com/p/${r.ig}/" target="_blank" rel="noopener">@deivpr · Instagram ↗</a>` : ''}</figure>`;
  $('.new__slides').innerHTML = RELEASES.slice(0, 3).map((r, i, all) => {
    const long = r.t.length > 14; // títulos largos no se parten palabra por palabra
    return `<article class="new__slide" role="group" aria-roledescription="slide" aria-label="${i + 1} de ${all.length}"${i ? ' hidden' : ''} style="--accent:${esc(r.accent || '#ff3b3b')}">
      <div class="new__text">
        <p class="eyebrow">${i ? 'Estreno anterior' : 'El más nuevo'} · ${dmy(r.date)}</p>
        <h2 class="new__title${long ? ' new__title--long' : ''}">${long ? esc(r.t) : r.t.split(' ').map(esc).join(' <br>')}</h2>
        <ul class="new__facts mono">${(r.facts || []).map(([l, t]) => `<li><b>${esc(l)}</b> ${esc(t)}</li>`).join('')}</ul>
        <div class="hero__cta"><button class="btn btn--light" data-yt="${esc(r.id)}">Ver el video</button>${r.listen ? `<a class="btn btn--ghost" href="${esc(r.listen)}" target="_blank" rel="noopener">Escuchar</a>` : ''}</div>
      </div>
      <button class="new__media" data-yt="${esc(r.id)}" aria-label="Ver el video de ${esc(r.t)}"><img src="${esc(r.cover)}" alt="${esc(r.coverAlt || 'Portada de ' + r.t)}"${i ? ' loading="lazy"' : ''}><span class="new__play" aria-hidden="true">▶</span></button>
      ${(r.reel || []).length ? `<div class="new__reel" aria-label="Imágenes de ${esc(r.t)}">${r.reel.map(reelItem).join('')}</div>` : ''}
    </article>`;
  }).join('');
  const slides = $$('.new__slide'), [toNewer, toOlder] = $$('.new__arrow'), nCount = $('.new__count');
  let cur = 0;
  const paintSlider = () => {
    slides.forEach((s, i) => (s.hidden = i !== cur));
    toNewer.disabled = cur === 0; toOlder.disabled = cur === slides.length - 1;
    nCount.textContent = `${cur + 1} / ${slides.length}`;
  };
  const goSlide = (n, dir) => {
    if (n < 0 || n >= slides.length || n === cur) return;
    const had = document.activeElement;
    cur = n; slides[cur].style.setProperty('--dir', dir); paintSlider();
    // si la flecha enfocada se deshabilita (llegó al extremo), el foco pasa a la otra y el teclado sigue funcionando
    if (had === toOlder && toOlder.disabled) toNewer.focus(); else if (had === toNewer && toNewer.disabled) toOlder.focus();
    if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh(); // cada slide tiene otro alto
  };
  $('.new__ctrl').hidden = slides.length < 2;
  toNewer.addEventListener('click', () => goSlide(cur - 1, -1));
  toOlder.addEventListener('click', () => goSlide(cur + 1, 1));
  $('#nuevo').addEventListener('keydown', e => { if (e.key === 'ArrowRight') goSlide(cur + 1, 1); if (e.key === 'ArrowLeft') goSlide(cur - 1, -1); });
  let swipeX = 0, swipeY = 0, swiping = false;
  $('.new__slides').addEventListener('touchstart', e => { swiping = !e.target.closest('.new__reel'); swipeX = e.touches[0].clientX; swipeY = e.touches[0].clientY; }, { passive: true }); // el reel tiene su propio scroll horizontal
  $('.new__slides').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - swipeX, dy = e.changedTouches[0].clientY - swipeY;
    if (swiping && Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) goSlide(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  }, { passive: true });
  paintSlider();

  $('#upd').textContent ='Datos actualizados el ' + new Date(UPDATED + 'T12:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

  $('.tl__track').innerHTML = TIMELINE.map(c => {
    const thumb = c.yt
      ? `<button class="card__thumb" data-yt="${c.yt}" aria-label="Ver ${c.t} en YouTube"><img src="${yt(c.yt)}" alt="" loading="lazy"></button>`
      : `<div class="card__thumb"><img src="${c.img}" alt="" loading="lazy"></div>`;
    return `<article class="card${c.ar ? ' card--ar' : ''}"><p class="card__y mono">${c.y}</p>${thumb}<div class="card__body"><h3>${c.t}</h3><p>${c.d}</p>${c.href ? `<a class="card__tag mono" href="${c.href}">${c.href === '#argentina' ? 'Ver las fotos' : 'Ver más'} →</a>` : ''}</div></article>`;
  }).join('');

  $('.vid__grid').innerHTML = VIDEOS.map(({ id, t, m, views }, i) =>
    `<button class="yt" data-yt="${esc(id)}" aria-label="Ver ${esc(t)}"><img src="https://i.ytimg.com/vi/${esc(id)}/${i === 0 ? 'maxresdefault' : 'hqdefault'}.jpg" onerror="this.onerror=null;this.src='${yt(esc(id))}'" alt="" loading="lazy"><span><small>${esc(m)}${views ? ' · ' + short(views) : ''}</small>${esc(t)}</span></button>`
  ).join('');

  /* ---------- press list: ordenada, filtrada (tipo + texto) y paginada ---------- */
  const PAGE = 5;
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const pdate = d => { const [y, m] = d.split('-'); return m ? `${MONTHS[+m - 1]} ${y}` : y; };
  const dkey = d => (d.length === 4 ? d + '-00' : d); // "2025" sin mes va después de los meses de 2025
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sorted = [...PRESS].sort((a, b) => dkey(b[0]).localeCompare(dkey(a[0]))); // más nueva primero, sin depender del orden de data.js
  const pList = $('.press__list'), pPager = $('.press__pager'), pInfo = $('.press__info'), pQ = $('.press__q');
  pList.innerHTML = sorted.map(([d, o, t, u, k], i) =>
    `<li data-k="${esc(k)}" data-q="${esc(norm(o + ' ' + t))}" data-peek="${PEEK[i % PEEK.length]}"><a href="${esc(u)}" target="_blank" rel="noopener"><span class="mono">${pdate(d)}</span><b>${esc(o)}</b><em>${esc(t)}</em><i class="mono">${esc(k)}</i><span aria-hidden="true">↗</span></a></li>`
  ).join('');
  const pItems = $$('li', pList), pState = { f: 'all', q: '', page: 1 };
  const renderPress = (refresh = true) => {
    const q = norm(pState.q.trim());
    const hits = pItems.filter(li => (pState.f === 'all' || li.dataset.k === pState.f) && (!q || li.dataset.q.includes(q)));
    const pages = Math.max(1, Math.ceil(hits.length / PAGE));
    pState.page = Math.min(pState.page, pages);
    const from = (pState.page - 1) * PAGE;
    pItems.forEach(li => (li.hidden = true));
    hits.slice(from, from + PAGE).forEach(li => (li.hidden = false));
    pInfo.textContent = hits.length ? `Mostrando ${from + 1}–${Math.min(from + PAGE, hits.length)} de ${hits.length} notas` : 'No hay notas con ese filtro. Probá con otra palabra o elegí “Todas”.';
    // ‹ 1 … 4 5 6 … 15 ›
    const nums = [...new Set([1, pState.page - 1, pState.page, pState.page + 1, pages])].filter(p => p >= 1 && p <= pages).sort((a, b) => a - b);
    pPager.hidden = pages < 2;
    pPager.innerHTML =
      `<button class="chip" data-p="${pState.page - 1}" aria-label="Página anterior"${pState.page === 1 ? ' disabled' : ''}>‹</button>` +
      nums.map((p, i) => (i && p - nums[i - 1] > 1 ? '<span class="press__gap" aria-hidden="true">…</span>' : '') +
        `<button class="chip${p === pState.page ? ' is-on' : ''}" data-p="${p}" aria-label="Página ${p}"${p === pState.page ? ' aria-current="page"' : ''}>${p}</button>`).join('') +
      `<button class="chip" data-p="${pState.page + 1}" aria-label="Página siguiente"${pState.page === pages ? ' disabled' : ''}>›</button>`;
    if (refresh && typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh(); // cambió el alto de la página
  };
  $$('.press__filters .chip').forEach(c => c.addEventListener('click', () => {
    $$('.press__filters .chip').forEach(x => x.classList.toggle('is-on', x === c));
    pState.f = c.dataset.f; pState.page = 1; renderPress();
  }));
  pQ.addEventListener('input', () => { pState.q = pQ.value; pState.page = 1; renderPress(); });
  pPager.addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b || b.disabled) return;
    pState.page = +b.dataset.p; renderPress();
    const top = pList.getBoundingClientRect().top + scrollY - 140; // vuelve al comienzo de la lista
    lenis ? lenis.scrollTo(top, { duration: 1 }) : scrollTo({ top, behavior: 'smooth' });
  });
  renderPress(false);
  const peek = $('.press__peek');
  pList.addEventListener('pointerover', e => {
    const li = e.target.closest('li'); if (!li) return;
    if (!peek.src.endsWith(li.dataset.peek)) peek.src = li.dataset.peek;
    peek.classList.add('on');
  });
  pList.addEventListener('pointerleave', () => peek.classList.remove('on'));
  pList.addEventListener('pointermove', e => { peek.style.transform = `translate3d(${e.clientX + 24}px, ${e.clientY - 120}px, 0) rotate(-4deg)`; });

  /* ---------- tiktoks ---------- */
  $('.soc__tt').innerHTML = TIKTOKS.map(([id, t]) =>
    `<button class="tt" data-tt="${id}" aria-label="Ver TikTok: ${t}"><img src="assets/social/tt_${id}.jpg" alt="" loading="lazy"><span>${t}</span></button>`
  ).join('');

  /* ---------- dialog: lightbox + youtube ---------- */
  const box = $('.box'), boxBody = $('.box__body');
  const openBox = html => { boxBody.innerHTML = html; box.showModal(); lenis && lenis.stop(); };
  // 'close' fires async: skip the wipe if something reopened the dialog meanwhile
  box.addEventListener('close', () => { if (box.open) return; boxBody.innerHTML = ''; lenis && lenis.start(); });
  $('.box__x').addEventListener('click', () => box.close());
  box.addEventListener('click', e => { if (e.target === box) box.close(); });
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-ig]');
    if (g && igCode(g.dataset.ig) && !(typeof moved !== 'undefined' && moved > 6)) return openBox(`<iframe class="box__ig" src="https://www.instagram.com/p/${g.dataset.ig}/embed/" title="Publicación de Instagram" scrolling="no"></iframe>`); // moved: no abrir si fue un arrastre del reel
    const t = e.target.closest('[data-tt]');
    if (t) return openBox(`<iframe class="box__tt" src="https://www.tiktok.com/player/v1/${t.dataset.tt}?autoplay=1&rel=0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="Video de TikTok"></iframe>`);
    const b = e.target.closest('[data-yt]');
    if (b) openBox(`<iframe src="https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video de YouTube"></iframe>`);
  });

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (!reduce && hasGsap && typeof Lenis !== 'undefined') {
    lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const velocity = () => (lenis ? lenis.velocity : 0);
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    closeMenu();
    lenis ? lenis.scrollTo(target, { duration: 1.6 }) : target.scrollIntoView();
  });

  /* ---------- menu ---------- */
  const burger = $('.nav__burger'), menu = $('.menu');
  $$('a', menu).forEach((a, i) => (a.style.transitionDelay = `${100 + i * 50}ms`));
  function closeMenu() {
    if (menu.hidden) return;
    menu.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Abrir menú');
    setTimeout(() => (menu.hidden = true), 400);
    lenis && lenis.start();
  }
  burger.addEventListener('click', () => {
    if (!menu.hidden) return closeMenu();
    menu.hidden = false; burger.setAttribute('aria-expanded', 'true'); burger.setAttribute('aria-label', 'Cerrar menú');
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
    lenis && lenis.stop();
  });
  addEventListener('keydown', e => e.key === 'Escape' && closeMenu());

  /* ---------- hero title split ---------- */
  const title = $('.hero__title');
  // per-letter solid colour from white to #9b9b9b: background-clip:text breaks on transformed children
  const chars = [...title.textContent];
  title.innerHTML = chars.map((c, i) => {
    const g = Math.round(255 - (100 * i) / (chars.length - 1));
    return `<span class="ch" aria-hidden="true" style="color:rgb(${g},${g},${g})">${c === ' ' ? '&nbsp;' : c}</span>`;
  }).join('');

  /* ---------- preloader ---------- */
  const loader = $('.loader'), loaderN = $('.loader__n span');
  document.body.classList.add('is-loading');
  const heroVideo = $('.hero__video');
  const ready = Promise.race([
    Promise.all([
      new Promise(r => (heroVideo.readyState >= 3 ? r() : heroVideo.addEventListener('canplay', r, { once: true }))),
      document.fonts ? document.fonts.ready : null,
    ]),
    new Promise(r => setTimeout(r, 3500)),
  ]);
  const t0 = performance.now();
  let loaded = false;
  ready.then(() => (loaded = true));
  (function count() {
    const p = Math.min(loaded ? 100 : 92, Math.round(((performance.now() - t0) / 1400) * 100));
    loaderN.textContent = p;
    if (p < 100) return requestAnimationFrame(count);
    intro();
  })();

  function intro() {
    document.body.classList.remove('is-loading');
    if (!hasGsap || reduce) { loader.remove(); return; }
    const tl = gsap.timeline({ onComplete: () => { loader.remove(); ScrollTrigger.refresh(); } });
    tl.to('.loader__q, .loader__n', { y: -32, opacity: 0, duration: 0.5, ease: 'power3.in', stagger: 0.05 })
      .to(loader, { yPercent: -100, duration: 1, ease: 'expo.inOut' })
      .from('.hero__video', { scale: 1.3, duration: 1.8, ease: 'expo.out' }, '-=0.6')
      .from('.hero__title .ch', { yPercent: 110, rotate: 8, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.06 }, '<0.1')
      .from('.hero .eyebrow, .hero__sub, .hero__cta .btn, .hero__meta, .nav', { y: 32, opacity: 0, filter: 'blur(8px)', duration: 1, ease: 'expo.out', stagger: 0.08 }, '<0.3');
  }

  /* ---------- reveal on enter ---------- */
  $$('.new__bar, .new__text > *, .new__media, .press__lead, .press__filters, .tt, .soc__col, .h2, .rec, .num, .fc__text > *, .yt, .arg__lead, .arg .eyebrow, .end > *, .tl__head p, .gal__head p').forEach(el => el.setAttribute('data-reveal', ''));
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const sibs = [...e.target.parentElement.children].filter(n => n.hasAttribute('data-reveal'));
    e.target.style.transitionDelay = `${Math.min(sibs.indexOf(e.target), 5) * 80}ms`;
    e.target.classList.add('in'); io.unobserve(e.target);
  }), { rootMargin: '0px 0px -10% 0px' });
  $$('[data-reveal]').forEach(el => io.observe(el));

  /* ---------- muted loops play only while visible ---------- */
  const vio = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting && !reduce) e.target.play().catch(() => {}); else e.target.pause();
  }), { threshold: 0.25 });
  $$('video[data-autoplay]').forEach(v => vio.observe(v));

  /* ---------- counters ---------- */
  const fmt = n => n.toLocaleString('es-AR');
  const cio = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target, end = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
    cio.unobserve(el);
    if (reduce || !hasGsap) { el.textContent = pre + fmt(end) + suf; return; }
    const o = { v: 0 };
    gsap.to(o, { v: end, duration: 2.2, ease: 'expo.out', onUpdate: () => (el.textContent = pre + fmt(Math.round(o.v)) + suf) });
  }), { threshold: 0.6 });
  $$('[data-count]').forEach(el => cio.observe(el));

  /* ---------- tagline: words light up one by one ---------- */
  const tag = $('.tagline__text');
  tag.innerHTML = tag.textContent.split(' ').map(w => `<span class="w">${w}</span>`).join(' ');
  const words = $$('.w', tag);
  if (hasGsap && !reduce) {
    ScrollTrigger.create({
      trigger: tag, start: 'top 80%', end: 'bottom 45%',
      onUpdate: st => { const n = Math.round(st.progress * words.length); words.forEach((w, i) => w.classList.toggle('on', i < n)); },
    });
  }

  /* ---------- bio: sticky image follows chapters ---------- */
  const bioImgs = $$('.bio__frame img'), bioN = $('.bio__count span');
  // active = last chapter whose top passed 60% of the viewport (survives fast flings, unlike a centre-line observer)
  const chapters = $$('.chapter');
  let bioIdx = 0, bioTick = false;
  addEventListener('scroll', () => {
    if (bioTick) return; bioTick = true;
    requestAnimationFrame(() => {
      bioTick = false;
      let i = 0; chapters.forEach((ch, k) => { if (ch.getBoundingClientRect().top < innerHeight * 0.6) i = k; });
      if (i === bioIdx) return; bioIdx = i;
      bioImgs.forEach((im, k) => im.classList.toggle('is-on', k === i));
      bioN.textContent = String(i + 1).padStart(2, '0');
    });
  }, { passive: true });

  /* ---------- nav active + progress ---------- */
  const navLinks = $$('.nav__links a');
  navLinks.forEach(a => {
    const sec = $(a.getAttribute('href'));
    if (!sec) return;
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) navLinks.forEach(l => l.classList.toggle('is-active', l === a));
    }, { rootMargin: '-50% 0px -50% 0px' }).observe(sec);
  });

  /* ---------- custom cursor ---------- */
  const cursor = $('.cursor');
  let mx = -100, my = -100, cx = -100, cy = -100;
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
  document.addEventListener('pointerover', e => cursor.classList.toggle('is-hover', !!e.target.closest('a, button')));

  /* ---------- bubbles (underwater) ---------- */
  const cv = $('.bubbles'), ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, bubbles = [];
  function sizeCanvas() {
    DPR = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const n = isPhone() ? 18 : 40;
    bubbles = Array.from({ length: n }, () => newBubble(Math.random() * H));
  }
  function newBubble(y = H + 20) {
    const r = Math.random() ** 2 * 14 + 2;
    return { x: Math.random() * W, y, r, s: 0.25 + r * 0.04 + Math.random() * 0.3, ph: Math.random() * 6.28, a: 0.08 + Math.random() * 0.22 };
  }

  /* ---------- marquee ---------- */
  const mTrack = $('.marquee__track');
  mTrack.innerHTML += mTrack.innerHTML;
  let mX = 0, mDir = -1;

  /* ---------- one RAF for cursor, bubbles, marquee ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(48, now - last) / 16.67; last = now;
    const v = velocity();
    // cursor
    cx += (mx - cx) * 0.2; cy += (my - cy) * 0.2;
    cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    // marquee: scroll speed boosts it, direction follows scroll
    if (Math.abs(v) > 0.5) mDir = v > 0 ? -1 : 1;
    if (!reduce) {
      mX += (1 + Math.abs(v) * 0.6) * mDir * dt;
      const half = mTrack.scrollWidth / 2;
      if (mX <= -half) mX += half; if (mX > 0) mX -= half;
      mTrack.style.transform = `translate3d(${mX}px,0,0)`;
    }
    // bubbles
    if (!reduce && !document.hidden) {
      ctx.clearRect(0, 0, W, H);
      const boost = 1 + Math.min(Math.abs(v) * 0.25, 6);
      for (const b of bubbles) {
        b.y -= b.s * boost * dt; b.ph += 0.02 * dt;
        let x = b.x + Math.sin(b.ph) * b.r * 0.8;
        const dx = x - mx, dy = b.y - my, d2 = dx * dx + dy * dy;
        if (d2 < 10000) { b.x += (dx / 100) * 1.2; }
        if (b.y < -30) Object.assign(b, newBubble());
        ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, 6.283);
        ctx.strokeStyle = `rgba(160,225,255,${b.a})`; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, 6.283);
        ctx.fillStyle = `rgba(255,255,255,${b.a * 1.4})`; ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  }
  if (!reduce) { sizeCanvas(); addEventListener('resize', sizeCanvas); }
  requestAnimationFrame(frame);

  /* ---------- gallery drag + lightbox ---------- */
  const strip = $('.gal__strip');
  let down = null, sx = 0, sl = 0, moved = 0;
  $$('.gal__strip, .new__reel').forEach(el => el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    down = el; moved = 0; sx = e.clientX; sl = el.scrollLeft; el.classList.add('is-drag'); e.preventDefault();
  }));
  addEventListener('pointermove', e => { if (!down) return; const d = e.clientX - sx; moved = Math.max(moved, Math.abs(d)); down.scrollLeft = sl - d; });
  addEventListener('pointerup', () => { if (down) down.classList.remove('is-drag'); down = null; });
  strip.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || moved > 6) return;
    const img = $('img', b);
    openBox(`<img src="${img.src}" alt="${img.alt}">`);
  });

  /* ---------- quotes carousel ---------- */
  const qq = $('.quo__q'), qs = $('.quo__src');
  let qi = 0;
  const showQ = () => { qq.textContent = QUOTES[qi][0]; qs.textContent = 'Dei V · ' + QUOTES[qi][1]; };
  showQ();
  setInterval(() => {
    qq.classList.add('out');
    setTimeout(() => { qi = (qi + 1) % QUOTES.length; showQ(); qq.classList.remove('out'); }, 700);
  }, 5200);

  if (!hasGsap || reduce) { $('.tl').style.overflowX = 'auto'; return; }

  /* ================= GSAP scroll scenes ================= */

  // progress bar
  const bar = $('.progress span');
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: st => (bar.style.transform = `scaleX(${st.progress})`) });

  // hero exits
  gsap.to('.hero__content', { yPercent: -25, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__video', { scale: 1.15, filter: 'blur(6px)', ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  // horizontal timeline
  const track = $('.tl__track');
  const dist = () => Math.max(0, track.scrollWidth - innerWidth);
  gsap.to(track, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: { trigger: '.tl', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 },
  });

  // scrub cinema (scroll-world technique: scroll drives currentTime)
  const layers = $$('.cine__layer'), copies = $$('.cine__copy article'), N = layers.length;
  const clips = ['s1', 's2', 's3', 's4'].map(n => `assets/video/${n}.mp4`);
  const vids = layers.map(() => ({ v: null, ready: false, cur: 0, target: 0 }));
  layers.forEach((l, i) => (l.style.zIndex = i));
  function loadClips() {
    layers.forEach((layer, i) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.addEventListener('loadedmetadata', () => (vids[i].ready = true));
      v.addEventListener('seeked', () => layer.classList.add('has-clip'), { once: true });
      layer.appendChild(v); vids[i].v = v;
      fetch(clips[i]).then(r => (r.ok ? r.blob() : Promise.reject())).then(b => (v.src = URL.createObjectURL(b))).catch(() => (v.src = clips[i]));
    });
  }
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { loadClips(); o.disconnect(); } }, { rootMargin: '150% 0px' }).observe($('.cine'));
  const prime = () => vids.forEach(o => o.v && o.v.play().then(() => o.v.pause()).catch(() => {}));
  addEventListener('touchstart', prime, { once: true, passive: true });

  ScrollTrigger.create({
    trigger: '.cine', start: 'top top', end: '+=' + N * 110 + '%', pin: '.cine__stage', scrub: true,
    onUpdate: st => {
      const seg = st.progress * N, i = Math.min(N - 1, Math.floor(seg)), local = seg - i;
      layers.forEach((l, j) => {
        l.style.opacity = j === 0 || j <= i ? 1 : j === i + 1 ? clamp((local - 0.82) / 0.18) : 0;
      });
      copies.forEach((c, j) => {
        let o = 0;
        if (j === i) o = (j === 0 ? 1 : clamp(local / 0.15)) * (j === N - 1 ? 1 : clamp((0.85 - local) / 0.12));
        c.style.opacity = o;
        c.style.transform = `translateY(${(0.5 - local) * (j === i ? 24 : 0)}px)`;
      });
      vids.forEach((o, j) => (o.target = j < i ? 1 : j === i ? local : 0));
    },
  });
  (function scrub() {
    const eps = isPhone() ? 0.04 : 0.02;
    for (const o of vids) {
      if (!o.ready || o.v.seeking) continue;
      o.cur += (o.target - o.cur) * 0.2;
      const t = clamp(o.cur, 0, 0.999) * (o.v.duration || 1);
      if (Math.abs(o.v.currentTime - t) > eps) o.v.currentTime = t;
    }
    requestAnimationFrame(scrub);
  })();

  // Argentina: the date fills in, then the photo stack
  gsap.from('.arg__date', { scale: 0.7, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.arg__date', start: 'top bottom', end: 'center 55%', scrub: true, onLeave: () => $('.arg__date').classList.add('is-filled'), onEnterBack: () => $('.arg__date').classList.remove('is-filled') } });

  const pics = $$('.arg__stack img'), caps = $$('.arg__caps p'), argN = $('.arg__n span');
  const stackTl = gsap.timeline({
    scrollTrigger: {
      trigger: '.arg__pin', start: 'top top', end: () => '+=' + pics.length * 55 + '%', pin: true, scrub: 0.8, invalidateOnRefresh: true,
      onUpdate: st => {
        const idx = Math.min(pics.length - 1, Math.floor(st.progress * pics.length));
        argN.textContent = String(idx + 1).padStart(2, '0');
        let on = 0; caps.forEach((c, k) => { if (idx >= +c.dataset.from) on = k; });
        caps.forEach((c, k) => c.classList.toggle('on', k === on));
      },
    },
  });
  pics.forEach((p, i) => {
    if (i === 0) return;
    const rot = (i % 2 ? 1 : -1) * (2 + (i % 3));
    // fromTo, not from: invalidateOnRefresh would re-read the offset y as the end value
    stackTl.fromTo(p, { y: () => innerHeight, rotation: rot * 3 }, { y: 0, rotation: rot * 0.5, ease: 'power2.out', duration: 1 })
      .to(pics[i - 1], { scale: 0.9, filter: 'brightness(0.35)', duration: 1 }, '<');
  });
  caps[0].classList.add('on');

  // signed flag: slow zoom into the signature
  gsap.fromTo('.fc__sign img', { scale: 1 }, { scale: 1.7, ease: 'none', scrollTrigger: { trigger: '.fc__sign', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('.fc__grid figure', { y: 120, opacity: 0, rotation: (i) => (i - 1) * 4, stagger: 0.12, ease: 'expo.out', duration: 1.4, scrollTrigger: { trigger: '.fc__grid', start: 'top 80%' } });

  // end title stretch
  gsap.from('.end__title', { letterSpacing: '0.1em', opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.end', start: 'top bottom', end: 'center center', scrub: true } });

  addEventListener('load', () => ScrollTrigger.refresh());
})();
