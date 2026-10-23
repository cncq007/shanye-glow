/* ==========================================================================
   山野拾光 · main.js
   内容渲染（读 content.js 的 SITE_DATA）
   图片板块：胶片走马灯 + 观片台（多效果切换/Ken Burns/自动播放/全屏）+ 拼贴墙
   视频板块：卡片墙 + 灯箱播放
   零依赖，file:// 直接可用
   ========================================================================== */
(function () {
  "use strict";

  var DATA = window.SITE_DATA || { site: {}, photos: [], videos: [] };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- 主题 ---------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem("sy-theme"); } catch (e) {}
    if (saved === "dark" || saved === "light") {
      document.documentElement.setAttribute("data-theme", saved);
      var t = $("#themeToggle");
      if (t) t.setAttribute("aria-pressed", String(saved === "dark"));
    }
    var btn = $("#themeToggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      var next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("sy-theme", next); } catch (e) {}
      btn.setAttribute("aria-pressed", String(next === "dark"));
    });
  }

  /* ---------- Header 滚动态 + Hero 视差 ---------- */
  function initScrollFx() {
    var header = $("#siteHeader");
    var heroImg = $("#heroImage");
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY || 0;
        if (header) header.classList.toggle("is-scrolled", y > 8);
        if (heroImg && y < window.innerHeight * 1.2) {
          heroImg.style.transform = "scale(1.06) translateY(" + y * 0.12 + "px)";
        }
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- 填充站点文案 ---------- */
  function renderSite() {
    var s = DATA.site || {};
    document.title = s.name + " · 个人作品集";
    var brand = $("#brandName"); if (brand) brand.textContent = s.name || "";
    var h = s.hero || {};
    if (h.image) { var hi = $("#heroImage"); if (hi) hi.src = h.image; }
    var set = function (id, text) { var el = $(id); if (el && text) el.textContent = text; };
    set("#heroEyebrow", h.eyebrow);
    set("#heroTitle", h.title);
    set("#heroSub", h.sub);
    var meta = $("#heroMeta");
    if (meta && h.meta) {
      meta.innerHTML = "";
      h.meta.forEach(function (m) {
        var sp = document.createElement("span");
        sp.setAttribute("role", "listitem");
        sp.textContent = m;
        meta.appendChild(sp);
      });
    }
    // 统计条
    var stats = $("#statsGrid");
    if (stats && s.stats) {
      stats.innerHTML = "";
      s.stats.forEach(function (st) {
        var div = document.createElement("div");
        div.className = "stat";
        div.innerHTML = '<div class="stat__value">' + st.value +
          '<span class="stat__unit">' + st.unit + "</span></div>" +
          '<div class="stat__label">' + st.label + "</div>";
        stats.appendChild(div);
      });
    }
    // 章节头部
    var g = s.gallery || {}, v = s.video || {}, a = s.about || {};
    set("#galleryNo", g.no); set("#galleryTitle", g.title); set("#galleryEn", g.titleEn);
    set("#galleryDesc", g.desc);
    set("#videoNo", v.no); set("#videoTitle", v.title); set("#videoEn", v.titleEn);
    set("#videoDesc", v.desc);
    set("#aboutNo", a.no); set("#aboutTitle", a.title); set("#aboutEn", a.titleEn);
    var aboutText = $("#aboutText");
    if (aboutText && a.text) {
      aboutText.innerHTML = "";
      a.text.forEach(function (para, i) {
        var p = document.createElement("p");
        if (i === 0) { var strong = document.createElement("strong"); strong.textContent = para; p.appendChild(strong); }
        else p.textContent = para;
        aboutText.appendChild(p);
      });
    }
    var facts = $("#factTable");
    if (facts && a.facts) {
      facts.innerHTML = "";
      a.facts.forEach(function (f) {
        var row = document.createElement("div");
        row.className = "fact-table__row";
        row.innerHTML = '<span class="fact-table__k">' + f.k + '</span><span class="fact-table__v">' + f.v + "</span>";
        facts.appendChild(row);
      });
    }
    var c = s.contact || {};
    set("#contactTitle", c.title);
    set("#contactSub", c.sub);
    var links = $("#contactLinks");
    if (links && c.links) {
      links.innerHTML = "";
      c.links.forEach(function (l) {
        var aEl = document.createElement("a");
        aEl.className = "contact-link";
        aEl.href = l.url;
        aEl.target = l.url.indexOf("http") === 0 ? "_blank" : "_self";
        aEl.rel = "noopener";
        aEl.textContent = l.name;
        links.appendChild(aEl);
      });
    }
    var foot = $("#footText"); if (foot && s.footer) foot.textContent = s.footer;
  }

  /* ==========================================================
     图片板块：胶片走马灯 + 观片台 + 拼贴墙
     ========================================================== */
  var gal = {
    items: [],        // 全部照片
    filtered: [],     // 当前筛选结果
    idx: 0,           // 观片台当前索引（相对 filtered）
    live: null,       // 当前显示图层
    idle: null,       // 备用图层
    step: 0,          // 切换效果轮换计数
    kb: 0,            // Ken Burns 变体轮换计数
    playing: false,
    timer: null,
    busy: false
  };

  var TRANSITIONS = ["fade", "slide", "zoom", "blur", "wipe"];
  var KBS = ["kb-1", "kb-2", "kb-3", "kb-4", "kb-5", "kb-6"];
  var TRANS_MS = 1150;   // 与 CSS 中图层过渡时长一致
  var PLAY_MS = 5600;    // 自动播放间隔

  /* ---------- 胶片走马灯 ---------- */
  function renderFilmstrip() {
    var track = $("#filmTrack");
    if (!track) return;
    track.innerHTML = "";
    // 两段相同的胶片，配合 translateX(-50%) 实现无缝循环
    for (var r = 0; r < 2; r++) {
      var reel = document.createElement("div");
      reel.className = "filmstrip__reel";
      gal.items.forEach(function (p, i) {
        var fig = document.createElement("figure");
        fig.className = "frame";
        var img = document.createElement("img");
        img.src = p.thumb;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        var cap = document.createElement("figcaption");
        cap.textContent = p.title;
        fig.appendChild(img);
        fig.appendChild(cap);
        fig.addEventListener("click", function () {
          goViewer(i);
          var stage = $("#viewerStage");
          if (stage) stage.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        reel.appendChild(fig);
      });
      track.appendChild(reel);
    }
  }

  /* ---------- 筛选栏（带计数） ---------- */
  function renderFilterBar() {
    var bar = $("#filterBar");
    if (!bar) return;
    var cats = [{ key: "all", name: "全部" }].concat(DATA.categories || []);
    bar.innerHTML = "";
    cats.forEach(function (c, i) {
      var n = c.key === "all"
        ? gal.items.length
        : gal.items.filter(function (p) { return p.category === c.key; }).length;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "filter-btn";
      b.innerHTML = c.name + '<span class="filter-btn__count">' + n + "</span>";
      b.dataset.key = c.key;
      b.setAttribute("aria-pressed", String(i === 0));
      b.addEventListener("click", function () {
        $$(".filter-btn", bar).forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        applyFilter(c.key);
      });
      bar.appendChild(b);
    });
  }

  function applyFilter(key) {
    gal.filtered = key === "all"
      ? gal.items.slice()
      : gal.items.filter(function (p) { return p.category === key; });
    renderThumbs();
    renderMosaic();
    goViewer(0, true);
  }

  /* ---------- 观片台 ---------- */
  function photoAt(i) { return gal.filtered[(i + gal.filtered.length) % gal.filtered.length]; }

  function updateInfo() {
    var p = photoAt(gal.idx);
    $("#viewerCount").textContent = pad(gal.idx + 1) + " / " + pad(gal.filtered.length);
    $("#viewerTitle").textContent = p.title;
    $("#viewerPlace").textContent = p.place || "";
    $("#viewerExif").textContent = [p.params, p.focal].filter(Boolean).join(" · ");
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function syncThumbs() {
    var thumbs = $$("#thumbs .thumb");
    thumbs.forEach(function (t, i) {
      t.classList.toggle("is-current", i === gal.idx);
      t.setAttribute("aria-selected", String(i === gal.idx));
    });
    var cur = thumbs[gal.idx];
    if (cur && cur.scrollIntoView) {
      cur.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }

  /* 预加载大图，返回 Promise；期间显示细线加载指示 */
  function preload(url) {
    var load = $("#viewerLoad");
    return new Promise(function (res) {
      var im = new Image();
      var done = false;
      var finish = function () { if (!done) { done = true; if (load) load.classList.remove("is-on"); res(); } };
      if (load) load.classList.add("is-on");
      im.onload = finish;
      im.onerror = finish;
      im.src = url;
      setTimeout(finish, 4000); // 兜底：别让加载条卡住
    });
  }

  /* 核心：切换到第 idx 张（dir: 1 下一张 / -1 上一张 / 0 直达） */
  function goViewer(idx, instant) {
    var list = gal.filtered;
    if (!list.length) return;
    var next = (idx + list.length) % list.length;
    if (next === gal.idx && gal.live && !instant) { updateInfo(); syncThumbs(); return; }

    var dir = instant ? 0 : (next > gal.idx || (gal.idx === list.length - 1 && next === 0)) ? 1 : -1;
    if (!instant && next === 0 && gal.idx === list.length - 1) dir = 1;
    if (!instant && next === list.length - 1 && gal.idx === 0) dir = -1;
    gal.idx = next;
    var p = list[gal.idx];

    var A = $("#vlA"), B = $("#vlB");
    if (!gal.live) { gal.live = A; gal.idle = B; }

    var img = gal.idle.querySelector("img");
    var show = function () {
      var entering = gal.idle, leaving = gal.live;
      // 首次或瞬时切换：不做动画
      if (instant) {
        entering.classList.add("no-anim");
        entering.querySelector("img").className = "viewer__img";
        entering.classList.add("is-live");
        leaving.classList.remove("is-live");
        leaving.classList.add("no-anim");
        void entering.offsetWidth;
        entering.classList.remove("no-anim");
        leaving.classList.remove("no-anim");
      } else {
        var variant = TRANSITIONS[gal.step++ % TRANSITIONS.length];
        entering.className = "viewer__layer v-" + variant +
          (dir < 0 ? " d-prev" : "") + " is-entering";
        img.className = "viewer__img " + KBS[gal.kb++ % KBS.length];
        void entering.offsetWidth; // 强制回流，让入场初态生效
        entering.classList.add("is-live");
        entering.classList.remove("is-entering");
        leaving.classList.add("is-leaving");
        leaving.classList.remove("is-live");
        // 过渡结束后清理，避免类名堆积
        setTimeout(function () {
          leaving.classList.remove("is-leaving", "v-slide", "v-zoom", "v-blur", "v-wipe", "d-prev");
        }, TRANS_MS + 60);
      }
      gal.live = entering;
      gal.idle = leaving;
      updateInfo();
      syncThumbs();
      gal.busy = false;
    };

    gal.busy = true;
    var src = p.full;
    if (img.src.indexOf(src) > -1) {
      show();
    } else {
      preload(src).then(function () { img.src = src; show(); });
    }
  }

  function viewerNext() { goViewer(gal.idx + 1); }
  function viewerPrev() { goViewer(gal.idx - 1); }

  /* ---------- 自动播放 ---------- */
  var progress = null;
  function tickProgress() {
    if (!progress) progress = $("#viewerProgress i");
    if (!progress) return;
    progress.style.transition = "none";
    progress.style.width = "0";
    void progress.offsetWidth;
    progress.style.transition = "width " + PLAY_MS + "ms linear";
    progress.style.width = "100%";
  }
  function startPlay() {
    if (gal.playing) return;
    gal.playing = true;
    $("#viewerStage").classList.add("is-playing");
    $('[data-vw-play]').setAttribute("aria-pressed", "true");
    tickProgress();
    gal.timer = setInterval(function () {
      viewerNext();
      tickProgress();
    }, PLAY_MS);
  }
  function stopPlay() {
    if (!gal.playing) return;
    gal.playing = false;
    clearInterval(gal.timer);
    $("#viewerStage").classList.remove("is-playing");
    var b = $('[data-vw-play]'); if (b) b.setAttribute("aria-pressed", "false");
    if (progress) {
      progress.style.transition = "none";
      progress.style.width = "0";
    }
  }
  function togglePlay() { gal.playing ? stopPlay() : startPlay(); }

  /* ---------- 全屏 ---------- */
  function toggleFull() {
    var stage = $("#viewerStage");
    var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    // 伪全屏兜底状态下再点一次 = 退出
    if (stage.classList.contains("is-fs")) {
      stage.classList.remove("is-fs");
      var bp = $('[data-vw-full]'); if (bp) bp.setAttribute("aria-pressed", "false");
      return;
    }
    if (fsEl) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    if (stage.requestFullscreen) {
      var p = stage.requestFullscreen();
      if (p && p.catch) p.catch(function () { stage.classList.add("is-fs"); });
    } else if (stage.webkitRequestFullscreen) {
      stage.webkitRequestFullscreen();
    } else {
      stage.classList.add("is-fs"); // 兜底：伪全屏
    }
  }
  function initFullListener() {
    var stage = $("#viewerStage");
    var onFs = function () {
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      stage.classList.toggle("is-fs", !!fsEl && (fsEl === stage));
      var b = $('[data-vw-full]');
      if (b) b.setAttribute("aria-pressed", String(!!fsEl && fsEl === stage));
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
  }

  /* ---------- 缩略图条 ---------- */
  function renderThumbs() {
    var box = $("#thumbs");
    if (!box) return;
    box.innerHTML = "";
    gal.filtered.forEach(function (p, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "thumb";
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", "false");
      b.setAttribute("aria-label", p.title);
      var img = document.createElement("img");
      img.src = p.thumb;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      b.appendChild(img);
      b.addEventListener("click", function () { goViewer(i); });
      box.appendChild(b);
    });
  }

  /* ---------- 拼贴墙 ---------- */
  var MOSAIC_PATTERN = ["b", "s", "w", "s", "s", "w", "s", "b", "s", "s", "w", "s"];

  function renderMosaic() {
    var box = $("#mosaic");
    if (!box) return;
    box.innerHTML = "";
    gal.filtered.forEach(function (p, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      var kind = MOSAIC_PATTERN[i % MOSAIC_PATTERN.length];
      btn.className = "mosaic__item" + (kind === "b" ? " mosaic__item--b" : kind === "w" ? " mosaic__item--w" : "");
      btn.setAttribute("aria-label", "查看大图：" + p.title);
      btn.style.opacity = "0";
      btn.style.transform = "translateY(14px)";
      btn.style.transition = "opacity .5s var(--ease), transform .5s var(--ease)";
      btn.style.transitionDelay = (i % 8) * 40 + "ms";

      var img = document.createElement("img");
      img.src = p.thumb;
      img.alt = p.title;
      img.loading = "lazy";
      img.decoding = "async";
      var veil = document.createElement("span");
      veil.className = "mosaic__veil";
      veil.innerHTML = '<span class="mosaic__t">' + p.title + "</span>" +
        '<span class="mosaic__p">' + p.place + "</span>";

      btn.appendChild(img);
      btn.appendChild(veil);
      btn.addEventListener("click", function () { openPhotoLightbox(i); });
      box.appendChild(btn);

      // 进场：等图片就位再浮现
      var show = function () {
        requestAnimationFrame(function () {
          btn.style.opacity = "1";
          btn.style.transform = "none";
        });
      };
      if (img.complete && img.naturalWidth) show();
      else { img.addEventListener("load", show, { once: true }); img.addEventListener("error", show, { once: true }); }
    });
  }

  /* ---------- 灯箱（图片） ---------- */
  var lbState = { list: [], idx: -1, lastFocus: null };

  function openLightboxCommon() {
    var lb = $("#lightbox");
    lbState.lastFocus = document.activeElement;
    lb.classList.add("is-open");
    document.body.style.overflow = "hidden";
    $("#lbClose").focus();
  }

  function closeLightbox() {
    var lb = $("#lightbox");
    lb.classList.remove("is-open");
    document.body.style.overflow = "";
    var stage = $("#lbStage");
    stage.innerHTML = "";
    $("#lbNavPrev").classList.add("is-hidden");
    $("#lbNavNext").classList.add("is-hidden");
    if (lbState.lastFocus && lbState.lastFocus.focus) lbState.lastFocus.focus();
  }

  function showPhoto(idx) {
    var list = lbState.list;
    if (!list.length) return;
    lbState.idx = (idx + list.length) % list.length;
    var p = list[lbState.idx];
    var stage = $("#lbStage");
    stage.innerHTML = "";
    var img = document.createElement("img");
    img.className = "lightbox__img";
    img.src = p.full;
    img.alt = p.title;
    stage.appendChild(img);

    $("#lbTitle").textContent = p.title;
    $("#lbMeta").textContent = [p.place, p.params, p.focal].filter(Boolean).join(" · ");
    $("#lbCount").textContent = (lbState.idx + 1) + " / " + list.length;
    var single = list.length < 2;
    $("#lbNavPrev").classList.toggle("is-hidden", single);
    $("#lbNavNext").classList.toggle("is-hidden", single);
  }

  function openPhotoLightbox(idx, list) {
    lbState.list = list || gal.filtered;
    showPhoto(idx);
    openLightboxCommon();
  }

  /* ---------- 灯箱（视频） ---------- */
  function openVideoLightbox(v) {
    lbState.list = [];
    lbState.idx = -1;
    var stage = $("#lbStage");
    stage.innerHTML = "";
    var video = document.createElement("video");
    video.className = "lightbox__video";
    video.src = v.src;
    video.poster = v.poster;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "metadata";
    stage.appendChild(video);
    $("#lbTitle").textContent = v.title;
    $("#lbMeta").textContent = [v.place, v.duration].filter(Boolean).join(" · ");
    $("#lbCount").textContent = "";
    $("#lbNavPrev").classList.add("is-hidden");
    $("#lbNavNext").classList.add("is-hidden");
    openLightboxCommon();
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* 自动播放被拦时让用户点播放 */ });
  }

  function initLightbox() {
    var lb = $("#lightbox");
    if (!lb) return;
    $("#lbClose").addEventListener("click", closeLightbox);
    $("#lbNavPrev").addEventListener("click", function () { showPhoto(lbState.idx - 1); });
    $("#lbNavNext").addEventListener("click", function () { showPhoto(lbState.idx + 1); });
    lb.addEventListener("click", function (e) {
      if (e.target === lb || e.target.id === "lbStage") closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft" && lbState.list.length) showPhoto(lbState.idx - 1);
      else if (e.key === "ArrowRight" && lbState.list.length) showPhoto(lbState.idx + 1);
    });
  }

  /* ---------- 观片台交互绑定 ---------- */
  function initViewer() {
    var stage = $("#viewerStage");
    if (!stage) return;

    $('[data-vw-prev]').addEventListener("click", function () { viewerPrev(); });
    $('[data-vw-next]').addEventListener("click", function () { viewerNext(); });
    $('[data-vw-play]').addEventListener("click", togglePlay);
    $('[data-vw-full]').addEventListener("click", toggleFull);
    initFullListener();

    // 首张直接铺上（无动画）
    var first = gal.filtered[0];
    if (first) {
      var img = $("#viewerImgA");
      img.src = first.full;
      gal.live = $("#vlA");
      gal.idle = $("#vlB");
      gal.idx = 0;
      updateInfo();
      syncThumbs();
    }

    // 键盘：观片台在视口内时接管方向键 / 空格 / F
    document.addEventListener("keydown", function (e) {
      if ($("#lightbox").classList.contains("is-open")) return;
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      var rect = stage.getBoundingClientRect();
      var inView = rect.top < window.innerHeight && rect.bottom > 0;
      if (!inView) return;
      if (e.key === "ArrowRight") { e.preventDefault(); viewerNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); viewerPrev(); }
      else if (e.key === " ") { e.preventDefault(); togglePlay(); }
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFull(); }
    });
  }

  /* ---------- 视频卡片 ---------- */
  var PLAY_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';

  function renderVideos() {
    var grid = $("#videoGrid");
    if (!grid) return;
    grid.innerHTML = "";   // 先清空：避免与文件里可能存在的预渲染内容重复
    (DATA.videos || []).forEach(function (v) {
      /* 占位卡：src 留空即为占位，只占格子不可播放（下次上新时填回 src/poster 即可） */
      if (!v.src) {
        var ph = document.createElement("div");
        ph.className = "video-card video-card--placeholder reveal";
        ph.setAttribute("aria-hidden", "true");
        ph.innerHTML =
          '<span class="video-card__frame video-card--placeholder__frame">' +
            '<span class="video-card--placeholder__mark">COMING SOON</span>' +
            '<span class="video-card__play" aria-hidden="true">' + PLAY_SVG + "</span>" +
          "</span>" +
          '<span class="video-card__body">' +
            '<span class="video-card__title" style="display:block">' + v.title + "</span>" +
            '<span class="video-card__place">' + (v.place || "") + "</span>" +
          "</span>";
        grid.appendChild(ph);
        return;
      }
      var card = document.createElement("button");
      card.type = "button";
      var feature = !!v.featured;
      card.className = "video-card reveal" + (feature ? " video-card--feature" : "");
      card.setAttribute("aria-label", "播放视频：" + v.title);
      var frame =
        '<span class="video-card__frame">' +
          '<img src="' + v.poster + '" alt="" loading="lazy" decoding="async">' +
          '<span class="video-card__scrim" aria-hidden="true"></span>' +
          '<span class="video-card__play" aria-hidden="true">' + PLAY_SVG + "</span>" +
          '<span class="video-card__duration" aria-hidden="true">' + (v.duration || "") + "</span>";
      if (feature) {
        // 通栏精选卡：标题压在封面上，不再要下方的 body 条
        frame +=
          '<span class="video-card__overlay">' +
            '<span class="video-card__badge" aria-hidden="true">精选长片</span>' +
            '<span class="video-card__title" style="display:block">' + v.title + "</span>" +
            '<span class="video-card__place">' + (v.place || "") + "</span>" +
          "</span>";
      }
      frame += "</span>";
      card.innerHTML = feature ? frame :
        frame +
        '<span class="video-card__body">' +
          '<span class="video-card__title" style="display:block">' + v.title + "</span>" +
          '<span class="video-card__place">' + (v.place || "") + "</span>" +
        "</span>";
      card.addEventListener("click", function () { openVideoLightbox(v); });
      grid.appendChild(card);
    });
  }

  /* ---------- 滚动进场 ---------- */
  function initReveal() {
    var els = $$(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-visible");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 启动 ---------- */
  function boot() {
    gal.items = (DATA.photos || []).slice();
    gal.filtered = gal.items.slice();
    initTheme();
    renderSite();
    renderFilmstrip();
    renderFilterBar();
    renderThumbs();
    renderMosaic();
    initViewer();
    renderVideos();
    initLightbox();
    initReveal();
    initScrollFx();
  }

  /* 会员区（cloud.js）复用灯箱：photo(idx, list) 支持传入自定义图片列表 */
  window.SG_LIGHTBOX = { photo: openPhotoLightbox, video: openVideoLightbox };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
