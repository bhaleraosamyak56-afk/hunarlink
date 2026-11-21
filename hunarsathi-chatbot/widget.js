/* ==========================================================================
   HunarSathi — Valley Craft Assistant
   --------------------------------------------------------------------------
   A dependency-free, offline-capable assistant for the HunarLink prototype.

   It is deliberately rule-based (no API key, no network call) so the demo
   never fails on stage:
     · answers GI / verification / wholesale / shipping questions
     · searches the live catalogue and renders tappable product cards
     · verifies a real GI tag against AppState products
     · drives the host page's existing modals & filters

   Exposes:  window.HunarSathi.open() / .close() / .toggle() / .ask(text)
   ========================================================================== */
(function () {
  'use strict';

  if (window.__hunarSathiLoaded) return;
  window.__hunarSathiLoaded = true;

  /* ── helpers ────────────────────────────────────────────────────────── */
  const $ = (sel, root) => (root || document).querySelector(sel);

  function page() {
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  function state() {
    return window.AppState || null;
  }

  function catalog() {
    if (typeof window.HL_getCatalog === 'function') {
      try {
        const list = window.HL_getCatalog();
        if (Array.isArray(list) && list.length) return list;
      } catch (e) { /* fall through */ }
    }
    if (typeof window.getAllProducts === 'function') {
      try { return window.getAllProducts() || []; } catch (e) { return []; }
    }
    return [];
  }

  function money(n) {
    if (typeof window.formatINR === 'function') return window.formatINR(n);
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function callHost(fn, ...args) {
    const f = window[fn];
    if (typeof f === 'function') {
      try { return f(...args); } catch (e) { /* host page may not have it */ }
    }
    return undefined;
  }

  /* ── knowledge base ─────────────────────────────────────────────────── */
  const GREETING =
    'Namaste! I\'m <b>HunarSathi</b>, your Valley craft guide. I can help you ' +
    'verify a GI tag, find a craft, or explain how the 3-step verification works.';

  const CHIPS = ['Verify a GI tag', 'Show pashmina', 'How does verification work?', 'Wholesale / B2B'];

  const INTENTS = [
    {
      id: 'verify',
      test: /(verify|gi ?tag|gi ?id|genuine|authentic|fake|certificate)/i,
      reply: () => {
        const p = catalog()[0];
        const sample = (p && p.giId) || 'GI-JK-PASH-8821';
        return {
          html: 'Sure — paste any GI code and I\'ll check it against the registry, ' +
                'or tap a sample below.<br><br>Every HunarLink piece carries a ' +
                '3-layer seal: <b>geo-verified loom</b> → <b>lab purity test</b> → ' +
                '<b>tamper-proof GI laser tag</b>.',
          after: () => callHost('openGiVerifyModal', sample)
        };
      }
    },
    {
      id: 'verification-flow',
      test: /(how.*(verif|work)|3.?step|three.?step|process|valley verification)/i,
      reply: () => ({
        html: 'The <b>Valley Verification Flow</b> has three stages:' +
              '<ul>' +
              '<li><b>1. Origin Check</b> — logged at the artisan\'s loom with GPS + workshop credentials</li>' +
              '<li><b>2. Lab Purity Test</b> — fibre &amp; weave testing (e.g. sub-16-micron Changthangi Pashmina)</li>' +
              '<li><b>3. GI Tag &amp; QR Seal</b> — tamper-proof government tag + scannable Digital Craft Passport</li>' +
              '</ul>',
        after: () => {
          if (page() === 'index.html') callHost('snav_scrollTo', 'snav-verify');
          else location.href = 'index.html#verification-section';
        }
      })
    },
    {
      id: 'wholesale',
      test: /(wholesale|b2b|bulk|hospitality|hotel|architect|trade|moq)/i,
      reply: () => ({
        html: 'We run a dedicated <b>B2B Hospitality &amp; Architectural Trade Portal</b> — ' +
              'direct guild pricing, MOQ from 10 units, batch GI certification and ' +
              'export-ready freight. I can open the lot calculator for you.',
        after: () => callHost('openB2BModal')
      })
    },
    {
      id: 'orders',
      test: /(order|track|shipment|delivery|dispatch|courier|my bag)/i,
      reply: () => ({
        html: 'You can follow your piece through 5 stages — <b>GI Audit → Loom Dispatch → ' +
              'Insured Transit → Customs → Delivered</b>. Opening your order tracker now.',
        after: () => callHost('openOrdersModal')
      })
    },
    {
      id: 'price',
      test: /(price|cost|how much|budget|cheap|expensive|₹|rs\.?|under)/i,
      reply: () => {
        const list = catalog().filter(p => !p.soldOut);
        const cheapest = list.slice().sort((a, b) => a.price - b.price)[0];
        const dearest = list.slice().sort((a, b) => b.price - a.price)[0];
        if (!cheapest) return { html: 'The catalogue is still loading — try a search instead.' };
        return {
          html: `Direct-from-loom pricing ranges from <b>${money(cheapest.price)}</b> ` +
                `(<i>${esc(cheapest.title)}</i>) up to <b>${money(dearest.price)}</b> ` +
                `(<i>${esc(dearest.title)}</i>). No middleman cut — the artisan receives it directly.`
        };
      }
    },
    {
      id: 'shipping',
      test: /(ship|deliver|freight|international|abroad|insured|return|refund)/i,
      reply: () => ({
        html: 'All pieces travel <b>fully insured</b> with a GI certificate inside the parcel. ' +
              'Domestic delivery is 3–6 working days; international 7–14 days with export ' +
              'documentation handled by our trade desk. Returns are accepted within 7 days ' +
              'if the GI seal is intact.'
      })
    },
    {
      id: 'pashmina',
      test: /(pashmina|kani|shawl|cashmere|changthangi|sozni)/i,
      reply: () => ({
        html: 'The <b>Pashmina &amp; Kani</b> guild works with sub-16-micron Ladakhi ' +
              'Changthangi fleece, hand-spun and woven on wooden foot looms using ' +
              'traditional Talim notation. Here are pieces from that guild:',
        search: 'pashmina'
      })
    },
    {
      id: 'walnut',
      test: /(walnut|wood|carv|lattice|chinar)/i,
      reply: () => ({
        html: 'Our <b>Walnut Woodcarving</b> guild is based in Anantnag &amp; Srinagar — ' +
              'seasoned 300-year-old timber, hand-chiselled with deep Chinar and ' +
              'Pinjrakari lattice relief:',
        search: 'walnut'
      })
    },
    {
      id: 'papier',
      test: /(papier|mache|mâché|naqash|gold leaf)/i,
      reply: () => ({
        html: 'The <b>Papier-Mâché</b> guild moulds Sakhta pulp vessels and illuminates ' +
              'them with 24K gold-leaf Hazara florals and Persian Guldan motifs:',
        search: 'papier-mache'
      })
    },
    {
      id: 'silk',
      test: /(silk|rug|carpet|knot|kpsi)/i,
      reply: () => ({
        html: 'Hand-knotted mulberry silk carpets from Srinagar &amp; Budgam looms — ' +
              'up to 900 knots per square inch:',
        search: 'silk-rugs'
      })
    },
    {
      id: 'artisan',
      test: /(artisan|maker|ustad|workshop|who made|register|sell|seller|studio)/i,
      reply: () => ({
        html: '2,400+ geo-verified artisans from Srinagar, Budgam, Anantnag and Baramulla ' +
              'list directly — with <b>zero middleman cut</b>. If you are an artisan, you can ' +
              'open the Artisan Studio and publish a piece in under a minute.',
        after: () => {
          if (page() === 'index.html') callHost('openArtisanStudioModal');
          else location.href = 'index.html';
        }
      })
    },
    {
      id: 'greeting',
      test: /^(hi|hey|hello|namaste|salaam|good (morning|evening|afternoon))/i,
      reply: () => ({ html: GREETING })
    },
    {
      id: 'thanks',
      test: /(thank|thanks|shukriya|great|nice|cool|perfect)/i,
      reply: () => ({ html: 'Anytime. Enjoy exploring the Valley\'s craft heritage.' })
    }
  ];

  /* ── catalogue search ───────────────────────────────────────────────── */
  function searchCatalogue(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(t => t.length > 2);
    return catalog()
      .map(p => {
        const hay = [p.title, p.artisan, p.guild, p.guildLabel, p.district, p.giId, p.description]
          .join(' ').toLowerCase();
        let score = 0;
        if (hay.includes(q)) score += 10;
        terms.forEach(t => { if (hay.includes(t)) score += 4; });
        if ((p.guild || '').toLowerCase() === q) score += 8;
        return { p, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(x => x.p);
  }

  function filterByGuild(guild) {
    return catalog().filter(p => p.guild === guild).slice(0, 4);
  }

  /* ── GI lookup: answer a pasted code directly in the chat ───────────── */
  function findGi(query) {
    const q = String(query || '').toUpperCase().replace(/[^A-Z0-9#-]/g, '');
    if (q.length < 6) return null;
    return catalog().find(p => {
      const id = String(p.giId || '').toUpperCase().replace(/[^A-Z0-9#-]/g, '');
      return id === q || id.replace(/-/g, '') === q.replace(/-/g, '');
    }) || null;
  }

  /* ── DOM ────────────────────────────────────────────────────────────── */
  let panel, log, input, launcher, chipsWrap;

  function build() {
    if (panel) return;

    launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'hs-launcher';
    launcher.setAttribute('aria-label', 'Open HunarSathi craft assistant');
    launcher.innerHTML =
      '<span class="hs-launcher-icon">🪡</span>' +
      '<span class="hs-launcher-label">Ask HunarSathi</span>' +
      '<span class="hs-launcher-dot"></span>';
    launcher.addEventListener('click', toggle);
    document.body.appendChild(launcher);

    panel = document.createElement('div');
    panel.className = 'hs-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'HunarSathi craft assistant');
    panel.innerHTML =
      '<div class="hs-header">' +
        '<div class="hs-header-main">' +
          '<div class="hs-avatar">🪡</div>' +
          '<div>' +
            '<div class="hs-title">HunarSathi</div>' +
            '<div class="hs-sub"><span class="hs-launcher-dot"></span> Valley craft assistant</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="hs-close" aria-label="Close assistant">✕</button>' +
      '</div>' +
      '<div class="hs-log" role="log" aria-live="polite"></div>' +
      '<div class="hs-chips"></div>' +
      '<form class="hs-form">' +
        '<input class="hs-input" type="text" placeholder="Ask about a craft, GI tag, or price…" ' +
          'aria-label="Message HunarSathi">' +
        '<button class="hs-send" type="submit" aria-label="Send">➤</button>' +
      '</form>';
    document.body.appendChild(panel);

    log = $('.hs-log', panel);
    input = $('.hs-input', panel);
    chipsWrap = $('.hs-chips', panel);

    $('.hs-close', panel).addEventListener('click', close);
    $('.hs-form', panel).addEventListener('submit', e => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      input.value = '';
      ask(v);
    });

    renderChips(CHIPS);
    addMsg(GREETING, 'bot');
  }

  function renderChips(list) {
    if (!chipsWrap) return;
    chipsWrap.innerHTML = '';
    list.forEach(label => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hs-chip';
      b.textContent = label;
      b.addEventListener('click', () => ask(label));
      chipsWrap.appendChild(b);
    });
  }

  function addMsg(html, who) {
    const el = document.createElement('div');
    el.className = 'hs-msg ' + (who === 'user' ? 'hs-user' : 'hs-bot');
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function addProductCards(products) {
    if (!products.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'hs-cards';
    products.forEach(p => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'hs-card';
      card.innerHTML =
        '<img alt="" src="' + esc(p.image) + '">' +
        '<div class="hs-card-meta">' +
          '<div class="hs-card-title">' + esc(p.title) + '</div>' +
          '<div class="hs-card-sub">' + esc(p.artisan || '') + ' • ' + esc(p.giId || '') + '</div>' +
        '</div>' +
        '<div class="hs-card-price">' + esc(money(p.price)) + '</div>';
      card.addEventListener('click', () => {
        if (typeof window.openProductPage === 'function') {
          window.openProductPage(p.id);
        } else if (typeof window.openProductModal === 'function') {
          window.openProductModal(p.id);
        }
      });
      wrap.appendChild(card);
    });
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  function typing() {
    const el = document.createElement('div');
    el.className = 'hs-msg hs-bot hs-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  /* ── the brain ──────────────────────────────────────────────────────── */
  let busy = false;

  function ask(text) {
    build();
    open();
    if (busy) return;
    busy = true;

    addMsg(esc(text), 'user');
    const t = typing();

    setTimeout(() => {
      t.remove();

      /* 1. a pasted GI code wins */
      const gi = findGi(text);
      if (gi) {
        addMsg(
          '✅ <b>Verified.</b><br>' +
          '<code>' + esc(gi.giId) + '</code><br><br>' +
          '<b>' + esc(gi.title) + '</b><br>' +
          'Ustad: ' + esc(gi.artisan) + '<br>' +
          'Cluster: ' + esc(gi.district || 'J&amp;K') + '<br>' +
          'Purity: ' + esc(gi.purityMetric || 'Lab verified') + '<br>' +
          'GI tier: Level ' + esc(gi.giLevel || 3) + ' • ' + esc(money(gi.price)),
          'bot'
        );
        addProductCards([gi]);
        busy = false;
        return;
      }

      /* 2. known intent */
      const intent = INTENTS.find(i => i.test.test(text));
      if (intent) {
        const r = intent.reply();
        addMsg(r.html, 'bot');
        if (r.search) {
          const items = r.search === 'pashmina'
            ? catalog().filter(p => p.guild === 'pashmina' || p.guild === 'sozni').slice(0, 3)
            : filterByGuild(r.search);
          addProductCards(items);
        }
        if (r.after) setTimeout(r.after, 260);
        busy = false;
        return;
      }

      /* 3. catalogue search */
      const found = searchCatalogue(text);
      if (found.length) {
        addMsg('Here\'s what I found for <b>' + esc(text) + '</b>:', 'bot');
        addProductCards(found);
        busy = false;
        return;
      }

      /* 4. honest fallback */
      addMsg(
        'I don\'t have that one yet. Try a craft name (<i>pashmina, walnut, silk rug, ' +
        'papier-mâché</i>), a GI code, or one of these:',
        'bot'
      );
      renderChips(['Verify a GI tag', 'Show silk rugs', 'Wholesale / B2B', 'How does verification work?']);
      busy = false;
    }, 620);
  }

  /* ── open / close ───────────────────────────────────────────────────── */
  function open() {
    build();
    panel.classList.add('hs-open');
    launcher.style.display = 'none';
    setTimeout(() => input && input.focus(), 180);
  }

  function close() {
    if (!panel) return;
    panel.classList.remove('hs-open');
    if (launcher) launcher.style.display = '';
  }

  function toggle() {
    build();
    panel.classList.contains('hs-open') ? close() : open();
  }

  /* ── boot ───────────────────────────────────────────────────────────── */
  function boot() {
    build();
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && panel && panel.classList.contains('hs-open')) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.HunarSathi = { open, close, toggle, ask, build };
})();
