/* ==========================================================================
   山野拾光 · 会员与留言（云服务版）
   - 游客注册：昵称 + 6 位字母/数字密码（SHA-256 哈希后传输，明文不出浏览器）
   - 留言板：仅留言者本人与站长可见，站长可回复
   - 会员专区：登录后可见的更多图片与影像
   云端只暴露 6 个校验身份的数据库函数，密码哈希永不回传。
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- 云服务公开配置（publishableKey 本身无权限，可随代码发布） ---------- */
  var CONFIG = {
    endpoint: "https://shanye-glow.app.workbuddy.host",
    oauthRelayBaseUrl: "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
    publishableKey: "wbpk_ihXnxbSwHZbR6xUU5GsUzI_ZwjGWDbkE012Fb88D3GRiOTtgineFKpy"
  };
  var PEPPER = "shanye-glow-2026";
  var SESSION_KEY = "sg_session";

  /* 云服务只接受在授权域名（endpoint 的主机）上发起的请求。
     其他镜像域名（如 shanyeglow.cn）上，会员功能自动跳到授权域名使用。 */
  var EP_HOST = CONFIG.endpoint.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  function originAllowed() {
    return location.hostname === EP_HOST;
  }
  function goToAllowedDomain() {
    location.assign("https://" + EP_HOST + "/" + (location.hash || ""));
  }

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* ---------- SHA-256（优先 WebCrypto，非安全上下文用内置实现兜底） ---------- */
  function sha256Sync(ascii) {
    function rr(v, c) { return (v >>> c) | (v << (32 - c)); }
    var maxWord = Math.pow(2, 32), result = "", words = [], asciiBitLength = ascii.length * 8;
    var hash = [], k = [], primeCounter = 0;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) return "";   // 非 ASCII，交回调用方走 WebCrypto
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = hash.slice(0);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i]
          + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b >> 4) > 15 ? "" : "") + ((b < 16) ? "0" : "") + b.toString(16);
      }
    }
    return result;
  }

  function pwdHash(nickname, pwd) {
    var input = nickname + "|" + pwd + "|" + PEPPER;
    if (window.crypto && window.crypto.subtle && window.isSecureContext) {
      return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ("0" + b.toString(16)).slice(-2);
        }).join("");
      });
    }
    return Promise.resolve(sha256Sync(unescape(encodeURIComponent(input))));
  }

  /* ---------- 云客户端 ---------- */
  var client = null, clientTried = false;
  function getClient() {
    if (!client && !clientTried) {
      clientTried = true;
      if (window.WorkBuddyCloud && window.WorkBuddyCloud.createWorkBuddyCloud) {
        try {
          client = window.WorkBuddyCloud.createWorkBuddyCloud({
            endpoint: CONFIG.endpoint,
            oauthRelayBaseUrl: CONFIG.oauthRelayBaseUrl,
            publishableKey: CONFIG.publishableKey
          });
        } catch (e) { client = null; }
      }
    }
    return client;
  }

  function rpc(name, params) {
    var c = getClient();
    if (!c) return Promise.reject(new Error("OFFLINE"));
    return c.database.rpc(name, params).then(function (res) {
      if (res && res.error) throw new Error(res.error.message || "REQUEST_FAILED");
      return res && res.data;
    });
  }

  /* ---------- 本地会话 ---------- */
  function getSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return s && s.nickname && s.hash ? s : null;
    } catch (e) { return null; }
  }
  function setSession(s) {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  }

  /* ---------- 校验 ---------- */
  var NICK_RE = /^[\u4e00-\u9fa5a-zA-Z0-9_·]{2,16}$/;
  var PWD_RE = /^[a-zA-Z0-9]{6}$/;

  /* ---------- 头部会员徽标 ---------- */
  function renderChip() {
    var chip = $("#authChip");
    if (!chip) return;
    var s = getSession();
    if (s) {
      chip.textContent = (s.is_admin ? "站长 · " : "") + s.nickname;
      chip.classList.add("auth-chip--on");
      chip.setAttribute("aria-label", "已登录，点击退出");
    } else {
      chip.textContent = "登录 / 注册";
      chip.classList.remove("auth-chip--on");
      chip.setAttribute("aria-label", "登录或注册");
    }
  }

  /* ---------- 注册 / 登录弹窗 ---------- */
  var modal = { mode: "login", open: false };

  function setModalMode(mode) {
    modal.mode = mode;
    $$(".auth-modal__tab").forEach(function (t) {
      t.setAttribute("aria-selected", t.dataset.mode === mode ? "true" : "false");
    });
    $("#amSubmit").textContent = mode === "login" ? "登录" : "注册并登录";
    $("#amPwd").setAttribute("inputmode", "text");
    setMsg("");
  }
  function setMsg(text, isErr) {
    var m = $("#amMsg");
    m.textContent = text || "";
    m.classList.toggle("is-err", !!isErr);
  }
  function openModal(mode) {
    if (!originAllowed()) { goToAllowedDomain(); return; }
    modal.open = true;
    $("#authModal").classList.add("is-open");
    document.body.style.overflow = "hidden";
    setModalMode(mode || "login");
    setTimeout(function () { $("#amNick").focus(); }, 60);
  }
  function closeModal() {
    modal.open = false;
    $("#authModal").classList.remove("is-open");
    document.body.style.overflow = "";
    $("#amForm").reset();
    setMsg("");
  }

  function handleAuthSubmit(e) {
    e.preventDefault();
    var nick = $("#amNick").value.trim();
    var pwd = $("#amPwd").value;
    if (!NICK_RE.test(nick)) { setMsg("昵称需要 2-16 个字符（中文、字母、数字均可）", true); return; }
    if (!PWD_RE.test(pwd)) { setMsg("密码必须是 6 位字母或数字", true); return; }
    $("#amSubmit").disabled = true;
    pwdHash(nick, pwd).then(function (hash) {
      var fn = modal.mode === "login" ? "sg_login" : "sg_register";
      return rpc(fn, { p_nickname: nick, p_pwd_hash: hash }).then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "操作失败，请重试");
        var s = getSession();
        setSession({ nickname: data.nickname || nick, is_admin: !!data.is_admin, hash: hash });
        closeModal();
        refreshAll();
      });
    }).catch(function (err) {
      setMsg(err.message === "OFFLINE" ? "暂时连不上服务器，请检查网络后重试" : (err.message || "操作失败，请重试"), true);
    }).finally(function () { $("#amSubmit").disabled = false; });
  }

  function logout() {
    setSession(null);
    refreshAll();
  }

  /* ---------- 会员专区 ---------- */
  var vipPhotos = [];

  function resolveVipPhotos() {
    var ids = (window.VIP_DATA && window.VIP_DATA.photoIds) || [];
    var photos = (window.SITE_DATA && window.SITE_DATA.photos) || [];
    vipPhotos = ids.map(function (id) {
      for (var i = 0; i < photos.length; i++) if (photos[i].id === id) return photos[i];
      return null;
    }).filter(Boolean);
  }

  function renderVip() {
    var teaser = $("#vipAuth"), content = $("#vipContent");
    if (!teaser || !content) return;
    var s = getSession();
    var descEl = $("#vipDesc");
    if (descEl && window.VIP_DATA && window.VIP_DATA.desc) descEl.textContent = window.VIP_DATA.desc;
    if (!s) {
      if (!originAllowed()) {
        var st = $(".vip-auth__t"), ss = $(".vip-auth__s"), sb = $("#vipTeaserBtn");
        if (st) st.textContent = "会员功能在 " + EP_HOST + " 开放";
        if (ss) ss.textContent = "当前域名为镜像展示站，点击下方按钮前往会员入口。";
        if (sb) sb.textContent = "前往会员入口";
      }
      teaser.classList.remove("is-hidden");
      content.classList.add("is-hidden");
      return;
    }
    if (!originAllowed()) { goToAllowedDomain(); return; }
    teaser.classList.add("is-hidden");
    content.classList.remove("is-hidden");

    resolveVipPhotos();
    var pg = $("#vipPhotoGrid");
    pg.innerHTML = "";
    vipPhotos.forEach(function (p, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vip-grid__item";
      btn.setAttribute("aria-label", "查看大图：" + p.title);
      btn.innerHTML =
        '<img src="' + p.thumb + '" alt="' + p.title + '" loading="lazy" decoding="async">' +
        '<span class="vip-grid__veil"><span class="vip-grid__t">' + p.title + "</span>" +
        '<span class="vip-grid__p">' + (p.place || "") + "</span></span>";
      btn.addEventListener("click", function () {
        if (window.SG_LIGHTBOX && window.SG_LIGHTBOX.photo) window.SG_LIGHTBOX.photo(i, vipPhotos);
      });
      pg.appendChild(btn);
    });

    var vg = $("#vipVideoGrid");
    vg.innerHTML = "";
    var videos = (window.VIP_DATA && window.VIP_DATA.videos) || [];
    videos.forEach(function (v) {
      if (!v.src) return;
      var card = document.createElement("button");
      card.type = "button";
      card.className = "video-card reveal is-visible";
      card.setAttribute("aria-label", "播放视频：" + v.title);
      card.innerHTML =
        '<span class="video-card__frame">' +
          '<img src="' + v.poster + '" alt="" loading="lazy" decoding="async">' +
          '<span class="video-card__scrim" aria-hidden="true"></span>' +
          '<span class="video-card__play" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>' +
          "</span>" +
          '<span class="video-card__duration" aria-hidden="true">' + (v.duration || "") + "</span>" +
        "</span>" +
        '<span class="video-card__body">' +
          '<span class="video-card__title" style="display:block">' + v.title + "</span>" +
          '<span class="video-card__place">' + (v.place || "") + "</span>" +
        "</span>";
      card.addEventListener("click", function () {
        if (window.SG_LIGHTBOX && window.SG_LIGHTBOX.video) window.SG_LIGHTBOX.video(v);
      });
      vg.appendChild(card);
    });
  }

  /* ---------- 留言板 ---------- */
  var boardBusy = false;

  function fmtTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function renderBoardLogin() {
    var s = getSession();
    if (!originAllowed()) {
      var bl = $(".board-login p");
      if (bl) bl.innerHTML = '留言板在 <a class="board-login__btn" style="text-decoration:none;cursor:pointer" href="https://' + EP_HOST + '/#board">' + EP_HOST + '</a> 开放，点击前往。';
    }
    $("#boardLogin").classList.toggle("is-hidden", !!s && originAllowed());
    $("#boardArea").classList.toggle("is-hidden", !s);
    if (s) $("#boardHint").textContent = s.is_admin
      ? "以站长身份查看全部留言，点击「回复」可答复。"
      : "留言只有你自己和站长能看到。";
  }

  function loadMessages() {
    var s = getSession();
    if (!s) { $("#boardList").innerHTML = ""; return; }
    var list = $("#boardList");
    list.innerHTML = '<p class="board-loading">正在加载留言…</p>';
    rpc("sg_messages", { p_nickname: s.nickname, p_pwd_hash: s.hash }).then(function (data) {
      if (!data || !data.ok) throw new Error((data && data.error) || "读取失败");
      renderMessages(data.messages || [], !!data.is_admin);
    }).catch(function (err) {
      list.innerHTML = '<p class="board-loading">' +
        (err.message === "OFFLINE" ? "暂时连不上服务器，稍后再试。" : "留言读取失败，请刷新重试。") + "</p>";
    });
  }

  function renderMessages(items, isAdmin) {
    var list = $("#boardList");
    if (!items.length) {
      list.innerHTML = '<p class="board-loading">还没有留言，写下第一条吧。</p>';
      return;
    }
    list.innerHTML = "";
    items.forEach(function (m) {
      var card = document.createElement("div");
      card.className = "board-msg";
      var html =
        '<div class="board-msg__head"><span class="board-msg__nick">' + esc(m.nickname) + "</span>" +
        '<span class="board-msg__time">' + fmtTime(m.created_at) + "</span></div>" +
        '<p class="board-msg__content">' + esc(m.content) + "</p>";
      if (m.reply) {
        html += '<div class="board-msg__reply"><span class="board-msg__reply-label">站长回复 · ' +
          fmtTime(m.replied_at) + "</span><p>" + esc(m.reply) + "</p></div>";
      }
      if (isAdmin && !m.reply) {
        html += '<div class="board-msg__replybox"><textarea maxlength="500" rows="2" placeholder="以站长身份回复…" aria-label="回复内容"></textarea>' +
          '<button type="button" class="board-msg__reply-btn" data-mid="' + m.id + '">回复</button></div>';
      }
      card.innerHTML = html;
      list.appendChild(card);
    });
    $$(".board-msg__reply-btn", undefined).forEach(function (btn) {
      btn.addEventListener("click", function () { submitReply(btn); });
    });
  }

  function submitReply(btn) {
    var s = getSession();
    if (!s || !s.is_admin || boardBusy) return;
    var box = btn.closest(".board-msg__replybox");
    var text = box.querySelector("textarea").value.trim();
    if (!text) return;
    boardBusy = true;
    btn.disabled = true;
    rpc("sg_reply", { p_nickname: s.nickname, p_pwd_hash: s.hash, p_message_id: Number(btn.dataset.mid), p_reply: text })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "回复失败");
        loadMessages();
      })
      .catch(function (err) { alert(err.message === "OFFLINE" ? "暂时连不上服务器" : (err.message || "回复失败")); })
      .finally(function () { boardBusy = false; btn.disabled = false; });
  }

  function handleBoardSubmit(e) {
    e.preventDefault();
    var s = getSession();
    if (!s) { openModal("login"); return; }
    var input = $("#boardInput");
    var text = input.value.trim();
    if (!text) return;
    var btn = $("#boardSend");
    btn.disabled = true;
    rpc("sg_post_message", { p_nickname: s.nickname, p_pwd_hash: s.hash, p_content: text })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "发送失败");
        input.value = "";
        $("#boardCount").textContent = "0 / 500";
        loadMessages();
      })
      .catch(function (err) { alert(err.message === "OFFLINE" ? "暂时连不上服务器，稍后再试" : (err.message || "发送失败")); })
      .finally(function () { btn.disabled = false; });
  }

  /* ---------- 汇总刷新 ---------- */
  function refreshAll() {
    renderChip();
    renderVip();
    renderBoardLogin();
    loadMessages();
  }

  /* ---------- 启动 ---------- */
  function init() {
    var chip = $("#authChip");
    if (chip) chip.addEventListener("click", function () {
      if (!originAllowed()) { goToAllowedDomain(); return; }
      getSession() ? logout() : openModal("login");
    });

    $("#amClose").addEventListener("click", closeModal);
    $("#authModal").addEventListener("click", function (e) { if (e.target === this) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal.open) closeModal(); });
    $$(".auth-modal__tab").forEach(function (t) {
      t.addEventListener("click", function () { setModalMode(t.dataset.mode); });
    });
    $("#amForm").addEventListener("submit", handleAuthSubmit);

    $("#boardForm").addEventListener("submit", handleBoardSubmit);
    var blBtn = $("#boardLoginBtn");
    if (blBtn) blBtn.addEventListener("click", function () { openModal("login"); });
    var vtBtn = $("#vipTeaserBtn");
    if (vtBtn) vtBtn.addEventListener("click", function () { openModal("login"); });
    $("#boardInput").addEventListener("input", function () {
      $("#boardCount").textContent = this.value.length + " / 500";
    });

    refreshAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
