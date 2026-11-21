/* Extracted verbatim from product.html's inline <script>.
   The converter drops <script> blocks, so the PDP controller is loaded as a
   module instead. It defines initPDP() and the zoom/hook helpers, and calls
   window.* so ported components can reach it. */

    let currentPdpProduct = null;

/* The legacy controller exposes its helpers on window. Resolve them at call
   time rather than at module-evaluation time, because ES module evaluation
   order put this file ahead of the controller's declarations. */
const getProductById = (...a) => window.getProductById(...a);
const formatINR = (...a) => window.formatINR(...a);
const addToCart = (...a) => window.addToCart(...a);
const toggleWishlist = (...a) => window.toggleWishlist(...a);
const showToast = (...a) => window.showToast(...a);

    function initPDP() {
      /* Inside the React shell this can fire before the PDP markup has mounted
         (the legacy DOMContentLoaded listener races the React render). Bail out
         rather than throwing on a null node — ProductPage calls this again once
         its markup is in the DOM. */
      if (!document.getElementById("pdp-title")) return;
      const params = new URLSearchParams(window.location.search);
      const prodId = params.get("id") || "hl-waln-001";
      const p = getProductById(prodId) || getAllProducts()[0];
      if (!p) return;
      currentPdpProduct = p;

      // Track into recently viewed history
      addToRecentlyViewed(p.id);

      // Update Auth UI buttons according to active session
      if (typeof updateAuthUI === "function") {
        updateAuthUI();
      }

      // Page Title
      document.title = `${p.title} — HunarLink Valley Craft Guild`;

      // Breadcrumb — set text on the spans so the shield icons survive
      document.getElementById("pdp-bc-title").textContent = p.title.toUpperCase();
      const guildCrumb = document.getElementById("pdp-bc-guild");
      if (guildCrumb) guildCrumb.textContent = p.guildLabel.toUpperCase();
      const clusterText = document.getElementById("pdp-bc-cluster-text");
      if (clusterText) clusterText.textContent = `Verified Mastercraft • ${p.district} Cluster`;

      // Gallery Stage
      document.getElementById("pdp-stage-gi-pill").textContent = `${p.giId} • ${p.guildLabel.toUpperCase()} REGISTRY`;
      document.getElementById("pdp-stage-cluster-pill").textContent = `${p.district} Cluster • ${p.purityMetric}`;
      const mainImg = document.getElementById("pdp-main-image");
      mainImg.src = p.image;
      mainImg.alt = p.title;
      if (mainImg.complete) { pdpZoomMeasure(); pdpZoomInit(); }
      else mainImg.addEventListener("load", () => { pdpZoomMeasure(); pdpZoomInit(); }, { once: true });

      // Wishlist float button status
      const isWished = AppState.wishlist.includes(p.id);
      const wishBtn = document.getElementById("pdp-stage-wish-btn");
      const wishIcon = document.getElementById("pdp-stage-wish-icon");
      if (wishBtn) wishBtn.classList.toggle("wishlisted", isWished);
      if (wishIcon) wishIcon.textContent = isWished ? "♥" : "♡";

      // 5 Thumbnails Setup (Full, Detail, Workshop, Artisan, Certificate)
      renderPdpThumbnails(p);

      // Details Column
      document.getElementById("pdp-title").textContent = p.title;
      document.getElementById("pdp-subtitle").textContent = `${p.guildLabel} Heritage Kashmiri Masterpiece`;

      // Technique tags
      const techTag = document.getElementById("pdp-tag-technique");
      if (techTag) {
        if (p.guild === "walnut") techTag.textContent = "HAND-CARVED";
        else if (p.guild === "silk-rugs") techTag.textContent = "HAND-KNOTTED";
        else if (p.guild === "papier-mache") techTag.textContent = "NAQASH-LACQUERED";
        else techTag.textContent = "HAND-WOVEN";
      }
      document.getElementById("pdp-tag-cluster").textContent = `${p.district.toUpperCase()} CLUSTER`;

      // Artisan Card
      const artisanAvatar = document.getElementById("pdp-artisan-avatar");
      if (artisanAvatar) {
        /* L2 fix: consistent generic atelier avatar for every product */
        artisanAvatar.src = "assets/image_1.jpg";
      }
      document.getElementById("pdp-artisan-name").textContent = p.artisan;
      document.getElementById("pdp-artisan-location").textContent = `Traditional Atelier, ${p.district} Cluster, Kashmir`;
      document.getElementById("pdp-artisan-exp").textContent = `${p.loomHours > 500 ? "45+" : "30+"} Yrs Lineage`;

      // Pricing
      const discountPct = Math.round(((p.mrp - p.price) / p.mrp) * 100);
      document.getElementById("pdp-price-main").textContent = formatINR(p.price);
      document.getElementById("pdp-price-mrp").textContent = formatINR(p.mrp);
      document.getElementById("pdp-price-discount").textContent = `Save ${formatINR(p.mrp - p.price)} (${discountPct}% Off)`;

      // Description
      document.getElementById("pdp-narrative").textContent = p.description;

      // Specifications
      document.getElementById("pdp-spec-technique-val").textContent = p.guild === "walnut" ? "Deep Relief & Openwork Jali / Pinjrakari" : (p.guild === "pashmina" ? "100% Hand-Spun Loom Weave" : p.purityMetric);
      document.getElementById("pdp-spec-material-val").textContent = p.purityMetric;
      document.getElementById("pdp-spec-origin-val").textContent = `${p.district} Cluster, Jammu & Kashmir`;
      document.getElementById("pdp-spec-hours-val").textContent = `${p.loomHours}+ Master Loom Hours`;

      // Render Suggestions & Recently Viewed
      renderPdpSuggestions(p);
      renderPdpRecentViewed();
    }

    function renderPdpThumbnails(p) {
      const strip = document.getElementById("pdp-thumbnails-strip");
      if (!strip) return;

      let thumbs;
      if (p.id === "hl-waln-001") {
        thumbs = [
          { label: "Editorial View", img: "assets/products/walnut_01.jpg" },
          { label: "Carving Detail", img: "assets/products/thumb_detail.jpg" },
          { label: "Workshop", img: "assets/products/thumb_workshop.jpg" },
          { label: "Artisan", img: "assets/products/thumb_artisan.jpg" },
          { label: "Certificate", img: "assets/products/thumb_cert.jpg" }
        ];
      } else if (p.guild === "pashmina") {
        thumbs = [
          { label: "Draped Look", img: p.image },
          { label: "Weave Detail", img: "assets/products/pashmina_detail.jpg" },
          { label: "Full Styling", img: "assets/products/pashmina_02.jpg" },
          { label: "Kani Border", img: "assets/products/kani_03.jpg" },
          { label: "GI Certificate", img: "assets/products/thumb_cert.jpg" }
        ];
      } else if (p.guild === "kani" || p.guild === "sozni") {
        thumbs = [
          { label: "Model View", img: "assets/products/kani_01.jpg" },
          { label: "Draped Style", img: "assets/products/kani_02.jpg" },
          { label: "Weave Detail", img: "assets/products/kani_03.jpg" },
          { label: "Border Detail", img: "assets/products/kani_04.jpg" },
          { label: "Full Spread", img: "assets/products/kani_05.jpg" }
        ];
      } else if (p.guild === "papier-mache") {
        /* Pull from the piece's own guild so the gallery shows different
           objects rather than the same four vessels on all twenty listings.
           Never repeat the hero shot, and never reuse a tile twice. */
        const picked = [];
        for (const cand of getAllProducts()) {
          if (picked.length >= 3) break;
          if (cand.guild !== p.guild || cand.id === p.id) continue;
          if (cand.image === p.image || picked.includes(cand.image)) continue;
          picked.push(cand.image);
        }
        thumbs = [
          { label: "Craft View", img: p.image },
          { label: "Guild Study I", img: picked[0] || p.image },
          { label: "Guild Study II", img: picked[1] || p.image },
          { label: "Gold Leaf Art", img: picked[2] || "assets/products/papier_05.jpg" },
          { label: "GI Certificate", img: "assets/products/thumb_cert.jpg" }
        ];
      } else {
        /* The fallback gallery used to fill two of its five tiles with the hero
           image repeated, which read as a rendering fault. Borrow from the
           same guild instead. */
        const pool = getAllProducts()
          .filter(x => x.guild === p.guild && x.id !== p.id && x.image !== p.image)
          .map(x => x.image);
        thumbs = [
          { label: p.guild === "walnut" ? "Editorial View" : "Full View", img: p.image },
          { label: p.guild === "walnut" ? "Carving Detail" : (p.guild === "silk-rugs" ? "Knot Detail" : "Craft Detail"),
            img: pool[0] || p.image },
          { label: "Styling View", img: pool[1] || "assets/image_1.jpg" },
          { label: "Heritage Look", img: pool[2] || "assets/image_6.jpg" },
          { label: "GI Certificate", img: "assets/products/thumb_cert.jpg" }
        ];
      }

      strip.innerHTML = thumbs.map((t, idx) => `
        <div class="pdp-thumb-card ${idx === 0 ? 'active' : ''}" onclick="selectPdpThumbnail(this, '${t.img}')">
          <img loading="lazy" decoding="async" src="${t.img}" alt="${t.label}" class="pdp-thumb-img">
          <div class="pdp-thumb-caption">${t.label}</div>
        </div>
      `).join("");
    }

    /* =====================================================================
       HOVER ZOOM — Amazon-style magnifier
       ---------------------------------------------------------------------
       A fixed-position panel beside the stage shows the photo magnified,
       following the cursor. The magnification factor is derived from the
       SOURCE resolution rather than fixed, because these product shots range
       from 378px to 1200px wide: a fixed 3x would look crisp on the 1200px
       walnut shot and like a blur on a 378px sozni one.

       Within a single image the factor is also clamped so the magnified patch
       can never run past the edge of the source — that is what produces the
       empty gutter you see in cheap zoom implementations.
       ===================================================================== */
    const PDP_ZOOM = {
      panel: 460,          // default lens size; shrinks if the screen is small
      gap: 18,             // breathing room between the stage and the lens
      maxScale: 2.4,       // a 2.4x read is generous; more feels like a funhouse mirror
      minScale: 1.25,
      natural: { w: 0, h: 0 },
      active: false,
      raf: 0,
      lastEvt: null
    };

    function pdpZoomElements() {
      return {
        stage: document.getElementById("pdp-stage-box"),
        img: document.getElementById("pdp-main-image"),
        lens: document.getElementById("pdp-zoom-lens"),
        marker: document.getElementById("pdp-zoom-marker")
      };
    }

    /* How much may we magnify before we are inventing pixels?
       `cover` is the scale at which the source fills the stage. At magnification
       f the user sees the photo at (cover * f) its native resolution, so
       (cover * f) <= 1.25 is the point past which the image starts to go soft.
       Solving for f gives the ceiling for each particular file, which is why
       the walnut shot (1200px) can zoom further than a 378px sozni detail. */
    function pdpZoomFactor(stageW, stageH, naturalW, naturalH) {
      const cover = Math.max(stageW / naturalW, stageH / naturalH);
      const MAX_UPSCALE = 1.25;          /* tolerate a quarter-stop of softness */
      const cap = MAX_UPSCALE / cover;
      return Math.max(PDP_ZOOM.minScale, Math.min(PDP_ZOOM.maxScale, cap));
    }

    function pdpZoomMeasure() {
      const { img } = pdpZoomElements();
      if (!img || !img.naturalWidth) return false;
      PDP_ZOOM.natural.w = img.naturalWidth;
      PDP_ZOOM.natural.h = img.naturalHeight;
      /* A fixed 460px panel only fits on wide screens. Scale it to the viewport
         so a scaled display or a small window still gets the side panel
         instead of being pushed into the in-frame path. */
      PDP_ZOOM.panel = Math.round(
        Math.max(280, Math.min(460, Math.min(window.innerWidth * 0.34, window.innerHeight * 0.62)))
      );
      return true;
    }

    function pdpZoomMove(evt) {
      const { stage, img, lens, marker } = pdpZoomElements();
      if (!stage || !img || !lens || !marker) return;
      if (!img.naturalWidth) return;

      const box = stage.getBoundingClientRect();
      const x = evt.clientX - box.left;
      const y = evt.clientY - box.top;
      if (x < 0 || y < 0 || x > box.width || y > box.height) { pdpZoomHide(); return; }

      const base = pdpZoomFactor(box.width, box.height, img.naturalWidth, img.naturalHeight);
      const factor = Math.max(1, Math.min(PDP_ZOOM.maxScale, base * (PDP_ZOOM.boost || 1)));

      /* Which mode? Free pixels are not the same as clear space: at 1600px
         the right margin measures ~480px but the details column occupies it,
         so a panel there lands on the price. Actually ask the document what is
         under the candidate rectangle. Only float if it is genuinely empty. */
      const roomRight = window.innerWidth - box.right - PDP_ZOOM.gap;
      const roomLeft = box.left - PDP_ZOOM.gap;

      const sideIsClear = (left, width) => {
        const probeX = left + width / 2;
        const probes = [0.25, 0.5, 0.75].map(f => box.top + box.height * f);
        for (const py of probes) {
          const el = document.elementFromPoint(
            Math.min(window.innerWidth - 2, Math.max(2, probeX)),
            Math.min(window.innerHeight - 2, Math.max(2, py))
          );
          if (!el) continue;
          /* the stage itself, or the lens sitting over nothing, is fine */
          if (stage.contains(el) || el === lens) continue;
          return false;
        }
        return true;
      };

      const canFloatRight = roomRight >= PDP_ZOOM.panel &&
        sideIsClear(box.right + PDP_ZOOM.gap, PDP_ZOOM.panel);
      const canFloatLeft = roomLeft >= PDP_ZOOM.panel &&
        sideIsClear(box.left - PDP_ZOOM.panel - PDP_ZOOM.gap, PDP_ZOOM.panel);
      const floating = canFloatRight || canFloatLeft;

      const badge = document.getElementById("pdp-zoom-badge");

      if (!floating) {
        /* ---------------- in-frame magnify ---------------- */
        lens.classList.remove("is-open");
        stage.classList.add("is-inframe");
        if (!PDP_ZOOM.active) {
          PDP_ZOOM.active = true;
          stage.classList.add("zooming");
        }
        const pctX = (x / box.width) * 100;
        const pctY = (y / box.height) * 100;
        stage.style.setProperty("--pdp-zoom", factor.toFixed(3));
        stage.style.setProperty("--pdp-origin-x", pctX.toFixed(2) + "%");
        stage.style.setProperty("--pdp-origin-y", pctY.toFixed(2) + "%");
        if (badge) badge.textContent = factor.toFixed(1).replace(/\.0$/, "") + "\u00d7";
        return;
      }

      /* ---------------- floating panel ---------------- */
      stage.classList.remove("is-inframe");
      stage.style.removeProperty("--pdp-zoom");
      stage.style.removeProperty("--pdp-origin-x");
      stage.style.removeProperty("--pdp-origin-y");

      /* background-size must reproduce object-fit:cover at (n * factor) */
      const cover = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
      const bgW = img.naturalWidth * cover * factor;
      const bgH = img.naturalHeight * cover * factor;

      /* where the image sits inside the stage under object-fit:cover */
      const renderedW = img.naturalWidth * cover;
      const renderedH = img.naturalHeight * cover;
      const offsetX = (box.width - renderedW) / 2;
      const offsetY = (box.height - renderedH) / 2;

      /* clamp so the panel never shows beyond the image edge */
      let px = (x - offsetX) * factor - PDP_ZOOM.panel / 2;
      let py = (y - offsetY) * factor - PDP_ZOOM.panel / 2;
      px = Math.max(0, Math.min(bgW - PDP_ZOOM.panel, px));
      py = Math.max(0, Math.min(bgH - PDP_ZOOM.panel, py));

      /* place the panel on a side we have already proven to be clear */
      let panelLeft;
      if (canFloatRight) {
        panelLeft = box.right + PDP_ZOOM.gap;
      } else {
        panelLeft = box.left - PDP_ZOOM.panel - PDP_ZOOM.gap;
      }
      panelLeft = Math.max(PDP_ZOOM.gap,
        Math.min(window.innerWidth - PDP_ZOOM.panel - PDP_ZOOM.gap, panelLeft));

      const panelTop = Math.max(PDP_ZOOM.gap,
        Math.min(window.innerHeight - PDP_ZOOM.panel - PDP_ZOOM.gap,
                 box.top + (box.height - PDP_ZOOM.panel) / 2));

      lens.style.width = PDP_ZOOM.panel + "px";
      lens.style.height = PDP_ZOOM.panel + "px";
      lens.style.left = panelLeft + "px";
      lens.style.top = panelTop + "px";
      lens.style.backgroundImage = `url("${img.currentSrc || img.src}")`;
      lens.style.backgroundSize = `${bgW}px ${bgH}px`;
      lens.style.backgroundPosition = `-${px}px -${py}px`;

      /* the marker traces the same patch back onto the stage */
      const markerW = PDP_ZOOM.panel / factor;
      const markerH = markerW;
      const mx = Math.max(0, Math.min(box.width - markerW, x - markerW / 2));
      const my = Math.max(0, Math.min(box.height - markerH, y - markerH / 2));
      marker.style.width = markerW + "px";
      marker.style.height = markerH + "px";
      marker.style.left = mx + "px";
      marker.style.top = my + "px";

      if (!PDP_ZOOM.active) {
        PDP_ZOOM.active = true;
        stage.classList.add("zooming");
      }
      lens.classList.add("is-open");
    }

    function pdpZoomHide() {
      const { stage, lens, marker } = pdpZoomElements();
      if (!PDP_ZOOM.active) return;
      PDP_ZOOM.active = false;
      if (stage) {
        stage.classList.remove("zooming");
        stage.classList.remove("is-inframe");
        stage.style.removeProperty("--pdp-zoom");
        stage.style.removeProperty("--pdp-origin-x");
        stage.style.removeProperty("--pdp-origin-y");
      }
      if (lens) lens.classList.remove("is-open");
      if (marker) { marker.style.width = "0px"; marker.style.height = "0px"; }
    }

    function pdpZoomInit() {
      const { stage, img } = pdpZoomElements();
      if (!stage || !img) return;
      if (stage.dataset.zoomBound === "1") return;
      stage.dataset.zoomBound = "1";

      /* Bind unconditionally.
         The old gate required (hover:hover) and (pointer:fine), which a
         touchscreen laptop or any hybrid device reports as FALSE even though
         it has a perfectly good trackpad. The zoom then silently never bound
         and the user saw nothing. Decide from the event itself instead: a
         real mouse move means a real pointer, whatever the media queries say. */
      stage.addEventListener("mouseenter", (e) => {
        if (e.pointerType === "touch") return;
        pdpZoomMeasure();
      });

      stage.addEventListener("mousemove", (e) => {
        if (e.pointerType === "touch") return;
        if (PDP_ZOOM.raf) return;
        PDP_ZOOM.lastEvt = e;
        PDP_ZOOM.raf = requestAnimationFrame(() => {
          PDP_ZOOM.raf = 0;
          if (PDP_ZOOM.lastEvt) pdpZoomMove(PDP_ZOOM.lastEvt);
        });
      });

      stage.addEventListener("mouseleave", pdpZoomHide);

      /* a click pins the magnified view on touch devices, where there is no
         hover to hold it open — this is the only way they can inspect detail */
      stage.addEventListener("click", (e) => {
        if (PDP_ZOOM.pinned) { PDP_ZOOM.pinned = false; pdpZoomHide(); return; }
        if (e.pointerType === "touch" || !window.matchMedia("(hover: hover)").matches) {
          PDP_ZOOM.pinned = true;
          pdpZoomMove(e);
        }
      });
      stage.addEventListener("touchstart", (e) => {
        if (PDP_ZOOM.pinned || !e.touches.length) return;
        const t = e.touches[0];
        pdpZoomMeasure();
        PDP_ZOOM.pinned = true;
        pdpZoomMove({ clientX: t.clientX, clientY: t.clientY, pointerType: "touch" });
      }, { passive: true });
      stage.addEventListener("touchmove", (e) => {
        if (!PDP_ZOOM.pinned || !e.touches.length) return;
        const t = e.touches[0];
        pdpZoomMove({ clientX: t.clientX, clientY: t.clientY, pointerType: "touch" });
      }, { passive: true });
      window.addEventListener("scroll", pdpZoomHide, { passive: true });
      window.addEventListener("resize", pdpZoomHide);

      /* keyboard route: the stage is focusable and the panel is reachable with
         arrow keys. A zoom that only works with a mouse is a bug, not a
         feature choice. */
      if (!stage.hasAttribute("tabindex")) stage.setAttribute("tabindex", "0");
      if (!stage.getAttribute("role")) stage.setAttribute("role", "img");
      const img0 = document.getElementById("pdp-main-image");
      if (img0 && !stage.getAttribute("aria-label")) {
        stage.setAttribute("aria-label", (img0.alt || "Product image") + " — press Enter to magnify");
      }
      PDP_ZOOM.kb = { x: 0.5, y: 0.5, on: false };
      const kbSynthetic = () => {
        const b = stage.getBoundingClientRect();
        return { clientX: b.left + b.width * PDP_ZOOM.kb.x,
                 clientY: b.top + b.height * PDP_ZOOM.kb.y };
      };
      stage.addEventListener("focus", () => { pdpZoomMeasure(); PDP_ZOOM.kb.on = true; pdpZoomMove(kbSynthetic()); });
      stage.addEventListener("blur", () => { PDP_ZOOM.kb.on = false; pdpZoomHide(); });
      stage.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 0.18 : 0.07;
        let used = true;
        if (e.key === "ArrowLeft")  PDP_ZOOM.kb.x = Math.max(0.05, PDP_ZOOM.kb.x - step);
        else if (e.key === "ArrowRight") PDP_ZOOM.kb.x = Math.min(0.95, PDP_ZOOM.kb.x + step);
        else if (e.key === "ArrowUp")    PDP_ZOOM.kb.y = Math.max(0.05, PDP_ZOOM.kb.y - step);
        else if (e.key === "ArrowDown")  PDP_ZOOM.kb.y = Math.min(0.95, PDP_ZOOM.kb.y + step);
        else if (e.key === "Escape") {
          /* must return here: the shared tail below re-opens the zoom, which
             meant Escape closed it and instantly reopened it. */
          e.preventDefault();
          PDP_ZOOM.kb.on = false;
          pdpZoomHide();
          return;
        }
        else if (e.key === "+" || e.key === "=") { PDP_ZOOM.boost = Math.min(2, (PDP_ZOOM.boost || 1) + 0.25); }
        else if (e.key === "-") { PDP_ZOOM.boost = Math.max(0.5, (PDP_ZOOM.boost || 1) - 0.25); }
        else used = false;
        if (used) { e.preventDefault(); PDP_ZOOM.kb.on = true; pdpZoomMove(kbSynthetic()); }
      });
    }

    function selectPdpThumbnail(cardEl, imgSrc) {
      document.querySelectorAll(".pdp-thumb-card").forEach(c => c.classList.remove("active"));
      cardEl.classList.add("active");
      const mainImg = document.getElementById("pdp-main-image");
      if (mainImg) {
        pdpZoomHide();
        mainImg.style.opacity = "0.7";
        setTimeout(() => {
          mainImg.src = imgSrc;
          mainImg.style.opacity = "1";
          /* the natural size changed with the source, so remeasure */
          if (mainImg.complete) pdpZoomMeasure();
          else mainImg.addEventListener("load", pdpZoomMeasure, { once: true });
        }, 120);
      }
    }

    function pdpToggleWishlist() {
      if (!currentPdpProduct) return;
      toggleWishlist(currentPdpProduct.id);
      const isWished = AppState.wishlist.includes(currentPdpProduct.id);
      const wishBtn = document.getElementById("pdp-stage-wish-btn");
      const wishIcon = document.getElementById("pdp-stage-wish-icon");
      if (wishBtn) wishBtn.classList.toggle("wishlisted", isWished);
      if (wishIcon) wishIcon.textContent = isWished ? "♥" : "♡";
    }

    function pdpHandleAddToCart() {
      if (!currentPdpProduct) return;
      addToCart(currentPdpProduct.id, 1);
      toggleDrawer('cart-drawer', true);
    }

    function pdpHandleBuyNow() {
      if (!currentPdpProduct) return;
      buyNow(currentPdpProduct.id);
    }

    function renderPdpSuggestions(current) {
      const grid = document.getElementById("pdp-suggestions-grid");
      if (!grid) return;

      // Same guild products first, excluding current product
      let matches = getAllProducts().filter(p => p.guild === current.guild && p.id !== current.id);
      if (matches.length < 4) {
        matches = matches.concat(getAllProducts().filter(p => p.id !== current.id && !matches.includes(p)));
      }
      matches = matches.slice(0, 4);

      grid.innerHTML = matches.map(p => {
        const isWished = AppState.wishlist.includes(p.id);
        const isCompared = AppState.compareList.includes(p.id);
        const discountPct = Math.round(((p.mrp - p.price) / p.mrp) * 100);
        return `
          <article class="product-card" data-product-id="${p.id}">
            <div class="product-img-wrap" onclick="openProductPage('${p.id}')">
              <img loading="lazy" decoding="async" src="${p.image}" alt="${p.title}">
              <span class="product-gi-pill">✓ ${p.giId}</span>
              <button type="button" class="product-wish-btn ${isWished ? "wishlisted" : ""}" onclick="event.stopPropagation(); toggleWishlist('${p.id}')" aria-label="Toggle Wishlist">
                ${isWished ? "♥" : "♡"}
              </button>
              <label class="product-compare-bar" onclick="event.stopPropagation();">
                <input type="checkbox" ${isCompared ? "checked" : ""} onchange="toggleCompare('${p.id}')">
                Compare
              </label>
            </div>
            <div class="product-body">
              <div class="product-meta-top">
                <span class="product-guild-tag">${p.guildLabel}</span>
                <span class="product-rating-badge">${p.rating.toFixed(1)} ★ (${p.reviewCount})</span>
              </div>
              <button type="button" class="product-title-btn" onclick="openProductPage('${p.id}')">${p.title}</button>
              <p class="product-artisan-line">by ${p.artisan} • ${p.district}</p>
              <div style="font-size: 0.7rem; color: var(--forest-700); background: var(--forest-50); padding: 4px 8px; border-radius: 4px; margin-bottom: 10px;">
                🔬 ${p.purityMetric}
              </div>
              <div class="product-footer-row">
                <div>
                  <div class="price-kicker">Direct Artisan Price (${discountPct}% Off)</div>
                  <div>
                    <span class="price-main">${formatINR(p.price)}</span>
                    <span class="price-mrp">${formatINR(p.mrp)}</span>
                  </div>
                </div>
              </div>
              <div class="product-card-actions">
                <button type="button" class="btn-card-cart" onclick="event.stopPropagation(); addToCart('${p.id}', 1)" title="Add ${p.title} to Bag">
                  <span class="btn-icon"><svg class="pdp-ico-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l1.5 13.5a1 1 0 0 1-1 1.1H5.5a1 1 0 0 1-1-1.1L6 7z"/><path d="M9 10V5.5a3 3 0 0 1 6 0V10"/></svg></span> Add to Cart
                </button>
                <button type="button" class="btn-card-buy" onclick="event.stopPropagation(); buyNow('${p.id}')" title="Buy ${p.title} Now">
                  <span class="btn-icon"><svg class="pdp-ico-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z"/></svg></span> Buy Now
                </button>
              </div>
            </div>
          </article>
        `;
      }).join("");
    }

    function renderPdpRecentViewed() {
      const section = document.getElementById("pdp-recent-section");
      const grid = document.getElementById("pdp-recent-grid");
      if (!grid || !section) return;

      const currentId = currentPdpProduct ? currentPdpProduct.id : null;
      const recentProducts = getRecentlyViewedProducts().filter(p => p.id !== currentId).slice(0, 4);

      if (recentProducts.length === 0) {
        section.style.display = "none";
        return;
      }

      section.style.display = "block";
      grid.innerHTML = recentProducts.map(p => {
        const isWished = AppState.wishlist.includes(p.id);
        const discountPct = Math.round(((p.mrp - p.price) / p.mrp) * 100);
        return `
          <article class="product-card" data-product-id="${p.id}">
            <div class="product-img-wrap" onclick="openProductPage('${p.id}')">
              <img loading="lazy" decoding="async" src="${p.image}" alt="${p.title}">
              <span class="product-gi-pill">✓ ${p.giId}</span>
              <button type="button" class="product-wish-btn ${isWished ? "wishlisted" : ""}" onclick="event.stopPropagation(); toggleWishlist('${p.id}')">
                ${isWished ? "♥" : "♡"}
              </button>
            </div>
            <div class="product-body">
              <div class="product-meta-top">
                <span class="product-guild-tag">${p.guildLabel}</span>
                <span class="product-rating-badge">${p.rating.toFixed(1)} ★ (${p.reviewCount})</span>
              </div>
              <button type="button" class="product-title-btn" onclick="openProductPage('${p.id}')">${p.title}</button>
              <p class="product-artisan-line">by ${p.artisan} • ${p.district}</p>
              <div class="product-footer-row">
                <div>
                  <div class="price-kicker">Direct Artisan Price (${discountPct}% Off)</div>
                  <div>
                    <span class="price-main">${formatINR(p.price)}</span>
                    <span class="price-mrp">${formatINR(p.mrp)}</span>
                  </div>
                </div>
              </div>
              <div class="product-card-actions">
                <button type="button" class="btn-card-cart" onclick="event.stopPropagation(); addToCart('${p.id}', 1)">
                  <span class="btn-icon"><svg class="pdp-ico-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l1.5 13.5a1 1 0 0 1-1 1.1H5.5a1 1 0 0 1-1-1.1L6 7z"/><path d="M9 10V5.5a3 3 0 0 1 6 0V10"/></svg></span> Add to Cart
                </button>
                <button type="button" class="btn-card-buy" onclick="event.stopPropagation(); buyNow('${p.id}')">
                  <span class="btn-icon"><svg class="pdp-ico-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z"/></svg></span> Buy Now
                </button>
              </div>
            </div>
          </article>
        `;
      }).join("");
    }

    // Initialize once DOM is ready
    window.addEventListener("DOMContentLoaded", () => {
      initPDP();
    });
  

/* ---------------------------------------------------------------------------
   React shell entry point.
   Inside the port the document is already loaded when this module runs, so the
   DOMContentLoaded listener above never fires. ProductPage calls this on mount
   and on any id change.
   --------------------------------------------------------------------------- */
window.__hunarInitPdp = function () {
  try {
    initPDP();
  } catch (err) {
    console.warn('[hunar] PDP init warning:', err && err.message);
  }
};
