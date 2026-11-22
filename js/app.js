(function () {
  "use strict";

  /* ======================= Shared helpers ======================= */

  const START_BAT_HELP =
    "이 페이지는 파일을 직접 열면(file://) 동작하지 않아요. " +
    "폴더 안의 <strong>start.bat</strong>을 더블클릭해서 실행해 주세요.";

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatTime(totalSeconds) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const ss = String(s).padStart(2, "0");
    if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + ss;
    return m + ":" + ss;
  }

  class HttpError extends Error {
    constructor(status, url) {
      super("HTTP " + status + " (" + url + ")");
      this.status = status;
    }
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new HttpError(res.status, url);
    return res.json();
  }

  function isNetworkError(err) {
    return location.protocol === "file:" || err instanceof TypeError;
  }

  function noticeHtml(title, bodyHtml, withHomeLink) {
    return (
      '<div class="notice error" role="alert">' +
      "<h2>" + escapeHtml(title) + "</h2>" +
      "<p>" + bodyHtml + "</p>" +
      (withHomeLink ? '<a class="btn primary" href="index.html">레슨 목록으로 가기</a>' : "") +
      "</div>"
    );
  }

  /* ======================= Home page ======================= */

  const homeMode = { editable: false, pagesUrl: "" };

  function isLanOrLocalHost() {
    const h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    return false;
  }

  async function hasLocalApi() {
    try {
      const res = await fetch("/api/server-info", { cache: "no-cache" });
      if (!res.ok) return null;
      const info = await res.json();
      if (!info || (info.port == null && !info.localUrl && !info.editable)) return null;
      return info;
    } catch (err) {
      return null;
    }
  }

  async function resolveHomeMode() {
    homeMode.editable = false;
    homeMode.pagesUrl = "";
    if (location.protocol === "file:") return;
    const localish = isLanOrLocalHost();
    const info = await hasLocalApi();
    // Hosted GitHub Pages: public hostname and/or no local API — study only.
    homeMode.editable = !!(localish && info);
    if (info && info.pagesUrl) homeMode.pagesUrl = String(info.pagesUrl);
    document.body.classList.toggle("hosted", !homeMode.editable);
  }

  function renderPagesNote() {
    const el = $("pages-url-note");
    if (!el) return;
    if (!homeMode.editable) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    if (homeMode.pagesUrl) {
      el.hidden = false;
      el.innerHTML =
        '휴대폰(모바일 데이터)에서는 이 주소로 학습하세요: <a href="' +
        escapeHtml(homeMode.pagesUrl) +
        '" target="_blank" rel="noopener">' +
        escapeHtml(homeMode.pagesUrl) +
        "</a>";
    } else {
      el.hidden = false;
      el.innerHTML = "휴대폰용 주소는 아직 없어요. <code>publish.bat</code>을 한 번 실행하면 만들어집니다.";
    }
  }

  async function initHome() {
    const listEl = $("lesson-list");
    await resolveHomeMode();
    if (homeMode.editable) bindAddLessonForm();
    renderPagesNote();

    if (location.protocol === "file:") {
      listEl.innerHTML = noticeHtml("서버로 실행해 주세요", START_BAT_HELP, false);
      return;
    }

    await refreshLessonList();
  }

  async function refreshLessonList() {
    const listEl = $("lesson-list");
    let data;
    try {
      data = await fetchJson("data/lessons.json");
    } catch (err) {
      const body = isNetworkError(err)
        ? START_BAT_HELP
        : "<code>data/lessons.json</code> 파일을 읽지 못했어요. 파일이 있는지, JSON 형식이 올바른지 확인해 주세요. (" +
          escapeHtml(err.message) + ")";
      listEl.innerHTML = noticeHtml("레슨 목록을 불러오지 못했어요", body, false);
      return;
    }

    const lessons = data && Array.isArray(data.lessons) ? data.lessons : [];
    if (!lessons.length) {
      const hint = homeMode.editable
        ? "아직 등록된 레슨이 없어요. 위에서 유튜브 주소를 넣어 추가해 보세요."
        : "아직 등록된 레슨이 없어요.";
      listEl.innerHTML = '<div class="notice"><p>' + hint + "</p></div>";
      return;
    }

    listEl.innerHTML = lessons.map(lessonCardHtml).join("");
    if (homeMode.editable) {
      listEl.querySelectorAll("[data-delete-id]").forEach(function (btn) {
        btn.addEventListener("click", onDeleteLesson);
      });
    }
  }

  function lessonCardHtml(lesson) {
    const id = String(lesson.id || "");
    const thumb = "https://i.ytimg.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg";
    const count = Number(lesson.sentenceCount) || 0;
    const duration = Number(lesson.duration) || 0;
    const lang = (lesson.lang === "ja") ? "ja" : "en";
    const badge = lang === "ja"
      ? '<span class="lang-badge is-ja">일본어</span>'
      : '<span class="lang-badge is-en">영어</span>';
    return (
      '<article class="lesson-card">' +
      '<a class="lesson-card-link" href="lesson.html?v=' + encodeURIComponent(id) + '">' +
      '<div class="lesson-thumb" style="background-image:url(\'' + escapeHtml(thumb) + '\')">' +
      badge +
      (duration ? '<span class="duration-badge">' + formatTime(duration) + "</span>" : "") +
      "</div>" +
      '<div class="lesson-body">' +
      '<h3 class="lesson-title-ko">' + escapeHtml(lesson.titleKo || lesson.title || id) + "</h3>" +
      (lesson.title ? '<p class="lesson-title-en"' + (lang === "ja" ? ' lang="ja"' : ' lang="en"') + ">" + escapeHtml(lesson.title) + "</p>" : "") +
      '<div class="lesson-meta">' +
      (lesson.channel ? "<span>" + escapeHtml(lesson.channel) + "</span>" : "") +
      (duration ? "<span>⏱ " + formatTime(duration) + "</span>" : "") +
      (count ? "<span>문장 " + count + "개</span>" : "") +
      "</div></div></a>" +
      '<button type="button" class="lesson-delete" data-delete-id="' + escapeHtml(id) +
      '" aria-label="레슨 삭제">삭제</button>' +
      "</article>"
    );
  }

  function setAddStatus(kind, html) {
    const el = $("add-lesson-status");
    if (!el) return;
    if (!html) {
      el.hidden = true;
      el.className = "add-status";
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.className = "add-status" + (kind ? " is-" + kind : "");
    el.innerHTML = html;
  }

  function bindAddLessonForm() {
    const form = $("add-lesson-form");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    form.addEventListener("submit", onAddLesson);
  }

  async function onAddLesson(e) {
    e.preventDefault();
    const input = $("yt-url");
    const btn = $("add-lesson-btn");
    const url = ((input && input.value) || "").trim();
    if (!url) {
      setAddStatus("error", "유튜브 주소를 입력해 주세요.");
      return;
    }
    if (location.protocol === "file:") {
      setAddStatus("error", START_BAT_HELP);
      return;
    }
    if (btn) btn.disabled = true;
    setAddStatus("progress", "레슨을 만드는 중이에요. 자막이 길거나 번역이 필요하면 1–2분 정도 걸릴 수 있어요.");
    try {
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url,
          lang: (($("lesson-lang") && $("lesson-lang").value) || "auto"),
        }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        throw new Error(data.error || "레슨을 추가하지 못했어요. (HTTP " + res.status + ")");
      }
      if (!data.jobId) throw new Error("서버가 작업 ID를 주지 않았어요.");
      await pollAddJob(data.jobId);
    } catch (err) {
      setAddStatus("error", escapeHtml(err.message || String(err)));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function pollAddJob(jobId) {
    const started = Date.now();
    const limit = 8 * 60 * 1000;
    while (Date.now() - started < limit) {
      const res = await fetch("/api/jobs/" + encodeURIComponent(jobId), { cache: "no-cache" });
      const job = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(job.error || "진행 상태를 확인하지 못했어요.");
      const msg = escapeHtml(job.message || "처리 중…");
      const pct = Math.max(0, Math.min(100, Number(job.progress) || 0));
      if (job.state === "done") {
        const title = job.lesson && (job.lesson.titleKo || job.lesson.title);
        let html = "레슨을 추가했어요" + (title ? ": <strong>" + escapeHtml(title) + "</strong>" : "") + ".";
        if (job.lesson && job.lesson.sentenceCount) {
          html += " 문장 " + escapeHtml(String(job.lesson.sentenceCount)) + "개.";
        }
        if (job.lesson && job.lesson.note) {
          html += "<br>" + escapeHtml(job.lesson.note);
        }
        setAddStatus("ok", html);
        if ($("yt-url")) $("yt-url").value = "";
        await refreshLessonList();
        await pollPublishStatus(html);
        return;
      }
      if (job.state === "error") {
        throw new Error(job.error || job.message || "레슨을 만들지 못했어요.");
      }
      setAddStatus(
        "progress",
        '<span class="add-meter"><span style="width:' + pct + '%"></span></span>' + msg
      );
      await new Promise(function (resolve) { setTimeout(resolve, 1200); });
    }
    throw new Error("시간이 너무 오래 걸려 중단했어요. 잠시 후 목록을 새로고침해 보거나 다시 시도해 주세요.");
  }

  async function onDeleteLesson(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = e.currentTarget.getAttribute("data-delete-id");
    if (!id) return;
    if (!window.confirm("이 레슨을 목록에서 삭제할까요? 저장된 학습 데이터도 함께 지워집니다.")) return;
    try {
      const res = await fetch("/api/lessons/" + encodeURIComponent(id), { method: "DELETE" });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || "삭제하지 못했어요.");
      await refreshLessonList();
      await pollPublishStatus("레슨을 삭제했어요.");
    } catch (err) {
      window.alert(err.message || String(err));
    }
  }

  async function pollPublishStatus(prefixHtml) {
    const prefix = prefixHtml ? prefixHtml + "<br>" : "";
    setAddStatus("progress", prefix + "휴대폰 사이트에 반영하는 중…");
    const started = Date.now();
    const limit = 3 * 60 * 1000;
    await new Promise(function (resolve) { setTimeout(resolve, 600); });
    while (Date.now() - started < limit) {
      let data = {};
      try {
        const res = await fetch("/api/publish-status", { cache: "no-cache" });
        data = await res.json().catch(function () { return {}; });
      } catch (err) {
        setAddStatus("error", prefix + "휴대폰 반영 상태를 확인하지 못했어요. publish.bat를 실행해 보세요.");
        return;
      }
      if (data && data.url) homeMode.pagesUrl = String(data.url);
      renderPagesNote();
      if (data.state === "ok") {
        let extra = "휴대폰 반영 완료";
        if (data.url) {
          extra += ': <a href="' + escapeHtml(data.url) + '" target="_blank" rel="noopener">' +
            escapeHtml(data.url) + "</a>";
        }
        setAddStatus("ok", prefix + extra);
        return;
      }
      if (data.state === "error") {
        setAddStatus(
          "error",
          prefix +
            "레슨은 저장됐지만 휴대폰 반영에 실패했어요. " +
            escapeHtml(data.message || "publish.bat를 실행해 주세요.")
        );
        return;
      }
      if (data.state === "running") {
        setAddStatus("progress", prefix + escapeHtml(data.message || "휴대폰 사이트에 반영하는 중…"));
      }
      await new Promise(function (resolve) { setTimeout(resolve, 1500); });
    }
    setAddStatus("error", prefix + "휴대폰 반영이 너무 오래 걸려요. 잠시 후 주소를 다시 열어 보거나 publish.bat를 실행해 주세요.");
  }

  /* ======================= Lesson page ======================= */

  const REPEAT_OPTIONS = [1, 3, 5, 0]; // 0 = infinite
  const SPEED_OPTIONS = [0.5, 0.75, 1];
  const POLL_MS = 100;
  const GAP_MS = 500;
  const SETTINGS_KEY = "shadowing.settings.v1";

  // YT.PlayerState values (hard-coded so we don't depend on YT being loaded)
  const YT_ENDED = 0;
  const YT_PLAYING = 1;
  const YT_PAUSED = 2;
  const YT_BUFFERING = 3;

  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    lessonLang: "en",
    sentences: [],
    index: 0,
    // idle: nothing running / loop: repeating one sentence / free: normal YouTube playback
    mode: "idle",
    // loop sub-phase: playing | gap (short pause between repeats) | held (user paused during gap)
    phase: "playing",
    repeatDone: 0,
    gapTimer: null,
    stopTimer: null,
    seekPending: null,
    player: null,
    playerReady: false,
    playerState: -1,
    rate: 1,
    rateRequested: 1,
    pollTimer: null,
    apiTimeout: null,
    userScrollUntil: 0,
    pausingUntil: 0,
    settings: loadSettings(),
  };

  function loadSettings() {
    const defaults = { repeat: 3, speed: 1, hideEn: false, hideKo: false, hideReading: false };
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return {
        repeat: REPEAT_OPTIONS.indexOf(saved.repeat) >= 0 ? saved.repeat : defaults.repeat,
        speed: SPEED_OPTIONS.indexOf(saved.speed) >= 0 ? saved.speed : defaults.speed,
        hideEn: saved.hideEn === true,
        hideKo: saved.hideKo === true,
        hideReading: saved.hideReading === true,
      };
    } catch (e) {
      return defaults;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (e) {
      /* storage may be unavailable (private mode); settings just won't persist */
    }
  }

  function showPageError(title, bodyHtml) {
    $("lesson-root").hidden = true;
    const box = $("page-error");
    box.innerHTML = noticeHtml(title, bodyHtml, true);
    box.hidden = false;
    $("title-ko").textContent = "레슨을 열 수 없어요";
  }

  function normalizeSentences(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (s) {
        return s && isFinite(Number(s.start)) && isFinite(Number(s.end));
      })
      .map(function (s, i) {
        const start = Math.max(0, Number(s.start));
        return {
          id: s.id || "s" + (i + 1),
          start: start,
          end: Math.max(start + 0.2, Number(s.end)),
          en: String(s.en || ""),
          ja: String(s.ja || ""),
          ko: String(s.ko || ""),
          reading: Array.isArray(s.reading) ? s.reading : [],
          romaji: String(s.romaji || ""),
          ko_pron: String(s.ko_pron || ""),
          expressions: Array.isArray(s.expressions) ? s.expressions : [],
          words: Array.isArray(s.words) ? s.words : [],
        };
      });
  }

  async function initLesson() {
    const v = (new URLSearchParams(location.search).get("v") || "").trim();

    if (!v) {
      showPageError("레슨이 선택되지 않았어요", "레슨 목록에서 공부할 영상을 골라 주세요.");
      return;
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(v)) {
      showPageError("레슨 주소가 올바르지 않아요", "레슨 목록에서 다시 선택해 주세요.");
      return;
    }
    if (location.protocol === "file:") {
      showPageError("서버로 실행해 주세요", START_BAT_HELP);
      return;
    }

    let data;
    try {
      data = await fetchJson("data/" + v + ".json");
    } catch (err) {
      let body;
      if (err instanceof HttpError && err.status === 404) {
        body = "<code>data/" + escapeHtml(v) + ".json</code> 파일을 찾을 수 없어요. 레슨 목록에서 다시 선택해 주세요.";
      } else if (isNetworkError(err)) {
        body = START_BAT_HELP;
      } else {
        body = "<code>data/" + escapeHtml(v) + ".json</code> 파일을 읽지 못했어요. JSON 형식을 확인해 주세요. (" +
          escapeHtml(err.message) + ")";
      }
      showPageError("레슨 데이터를 불러오지 못했어요", body);
      return;
    }

    state.lessonLang = data && data.lang === "ja" ? "ja" : "en";
    document.body.dataset.lessonLang = state.lessonLang;
    state.sentences = normalizeSentences(data && data.sentences);
    if (!state.sentences.length) {
      showPageError("문장이 없어요", "<code>data/" + escapeHtml(v) + ".json</code>에 sentences 항목이 비어 있어요.");
      return;
    }

    const titleKo = data.titleKo || data.title || v;
    $("title-ko").textContent = titleKo;
    const sub = data.titleKo && data.title ? data.title : data.channel || "";
    $("title-en").textContent = sub;
    if (state.lessonLang === "ja") $("title-en").setAttribute("lang", "ja");
    else $("title-en").setAttribute("lang", "en");
    document.title = titleKo + " – 쉐도잉";
    $("list-count").textContent = "총 " + state.sentences.length + "문장";
    applyLessonLanguageUi();
    $("lesson-root").hidden = false;

    renderSentenceList();
    bindControls();
    applySettingsUi();
    selectSentence(0, { forceScroll: true });
    updateControls();

    loadYouTubeApi(String(data.youtubeId || data.id || v));
  }

  /* ---------- Rendering ---------- */

  function originalText(s) {
    if (state.lessonLang === "ja") return String((s && (s.ja || s.en)) || "");
    return String((s && (s.en || s.ja)) || "");
  }

  function rubyHtml(sentence) {
    const tokens = sentence && sentence.reading;
    const fallback = escapeHtml(originalText(sentence || {}));
    if (!Array.isArray(tokens) || !tokens.length) return fallback;
    return tokens.map(function (tok) {
      if (!tok || typeof tok !== "object") return "";
      const t = escapeHtml(String(tok.t || tok.text || ""));
      const r = String(tok.r || tok.reading || "").trim();
      if (r && r !== String(tok.t || tok.text || "").trim()) {
        return "<ruby>" + t + "<rt>" + escapeHtml(r) + "</rt></ruby>";
      }
      return t;
    }).join("");
  }

  function applyLessonLanguageUi() {
    const ja = state.lessonLang === "ja";
    const enBtn = $("tgl-en");
    const enLabel = $("tgl-en-label");
    const hint = $("cur-en-hint");
    const readingBtn = $("tgl-reading");
    const cur = $("cur-en");
    if (enLabel) enLabel.textContent = ja ? "일본어 숨기기" : "영어 숨기기";
    if (enBtn) enBtn.setAttribute("aria-label", ja ? "일본어 숨기기" : "영어 숨기기");
    if (hint) hint.textContent = ja ? "일본어 숨김 · 눌러서 잠깐 보기" : "영어 숨김 · 눌러서 잠깐 보기";
    if (cur) {
      cur.setAttribute("lang", ja ? "ja" : "en");
      cur.setAttribute("data-lang", ja ? "ja" : "en");
    }
    if (readingBtn) readingBtn.hidden = !ja;
  }

  function renderSentenceList() {
    const html = state.sentences
      .map(function (s, i) {
        return (
          '<li class="s-item" data-index="' + i + '">' +
          '<button type="button" class="s-btn" data-index="' + i + '" aria-label="' + (i + 1) + "번 문장 재생, " +
          formatTime(s.start) + '">' +
          '<span class="s-time">' + formatTime(s.start) + "</span>" +
          '<span class="s-text">' +
          '<span class="s-en" lang="' + (state.lessonLang === "ja" ? "ja" : "en") + '">' +
          (state.lessonLang === "ja" ? rubyHtml(s) : escapeHtml(s.en)) + "</span>" +
          (state.lessonLang === "ja" && (s.ko_pron || "").trim()
            ? '<span class="s-kopron">' + escapeHtml(s.ko_pron) + "</span>"
            : "") +
          '<span class="s-ko">' + escapeHtml(s.ko) + "</span>" +
          "</span></button></li>"
        );
      })
      .join("");
    $("sentence-list").innerHTML = html;
  }

  function renderCurrent() {
    const s = state.sentences[state.index];
    const total = state.sentences.length;
    const origEl = $("cur-en").querySelector(".mask-text");
    if (state.lessonLang === "ja") origEl.innerHTML = rubyHtml(s);
    else origEl.textContent = s.en;
    $("cur-ko").querySelector(".mask-text").textContent = s.ko;
    const hideR = !!state.settings.hideReading;
    const kp = $("cur-kopron");
    if (kp) {
      const showKp = state.lessonLang === "ja" && !!(s.ko_pron || "").trim() && !hideR;
      kp.hidden = !showKp;
      kp.textContent = showKp ? s.ko_pron : "";
    }
    const ro = $("cur-romaji");
    if (ro) {
      const showRo = state.lessonLang === "ja" && !!(s.romaji || "").trim() && !hideR;
      ro.hidden = !showRo;
      ro.textContent = showRo ? s.romaji : "";
    }
    $("cur-en").classList.remove("peek");
    $("cur-ko").classList.remove("peek");
    $("cur-index").textContent = "문장 " + (state.index + 1);
    $("cur-time").textContent = formatTime(s.start) + " – " + formatTime(s.end);
    $("pos-label").textContent = state.index + 1 + " / " + total;
    renderVocab(s);
  }

  function renderVocab(s) {
    const body = $("vocab-body");
    if (!s.expressions.length && !s.words.length) {
      body.innerHTML = '<p class="vocab-empty">이 문장에서 따로 볼 표현은 없어요</p>';
      return;
    }
    const cards = [];
    const phrLang = state.lessonLang === "ja" ? "ja" : "en";
    s.expressions.forEach(function (e) {
      if (!e) return;
      const phrase = e.phrase || e.ja || "";
      if (!phrase) return;
      cards.push(
        '<div class="vocab-card">' +
        '<span class="vocab-kind">표현</span>' +
        '<p class="vocab-phrase" lang="' + phrLang + '">' + escapeHtml(phrase) + "</p>" +
        (e.ko_pron ? '<p class="vocab-kopron">' + escapeHtml(e.ko_pron) + "</p>" : "") +
        (e.reading ? '<p class="vocab-reading">' + escapeHtml(e.reading) + "</p>" : "") +
        (e.meaning ? '<p class="vocab-meaning">' + escapeHtml(e.meaning) + "</p>" : "") +
        (e.note ? '<p class="vocab-note">' + escapeHtml(e.note) + "</p>" : "") +
        "</div>"
      );
    });
    s.words.forEach(function (w) {
      if (!w) return;
      const word = w.word || w.ja || "";
      if (!word) return;
      cards.push(
        '<div class="vocab-card">' +
        '<span class="vocab-kind word">단어</span>' +
        '<p class="vocab-phrase" lang="' + phrLang + '">' + escapeHtml(word) + "</p>" +
        (w.ko_pron ? '<p class="vocab-kopron">' + escapeHtml(w.ko_pron) + "</p>" : "") +
        (w.reading ? '<p class="vocab-reading">' + escapeHtml(w.reading) + "</p>" : "") +
        (w.meaning ? '<p class="vocab-meaning">' + escapeHtml(w.meaning) + "</p>" : "") +
        "</div>"
      );
    });
    body.innerHTML = '<div class="vocab-grid">' + cards.join("") + "</div>";
  }

  function selectSentence(i, opts) {
    const options = opts || {};
    const list = $("sentence-list");
    const prev = list.children[state.index];
    if (prev) {
      prev.classList.remove("current");
      prev.firstElementChild.removeAttribute("aria-current");
    }
    state.index = i;
    const li = list.children[i];
    if (li) {
      li.classList.add("current");
      li.firstElementChild.setAttribute("aria-current", "true");
    }
    renderCurrent();
    scrollListTo(i, options.forceScroll);
    updateControls();
  }

  function scrollListTo(i, force) {
    if (!force && Date.now() < state.userScrollUntil) return;
    const list = $("sentence-list");
    const li = list.children[i];
    if (!li) return;
    const top = li.offsetTop - list.clientHeight / 2 + li.offsetHeight / 2;
    const target = Math.max(0, top);
    if (typeof list.scrollTo === "function") {
      list.scrollTo({ top: target, behavior: reduceMotion ? "auto" : "smooth" });
    } else {
      list.scrollTop = target;
    }
  }

  function updateControls() {
    const last = state.sentences.length - 1;
    $("btn-prev").disabled = state.index <= 0;
    $("btn-next").disabled = state.index >= last;

    const active = isActive();
    const playBtn = $("btn-play");
    playBtn.setAttribute("aria-label", active ? "일시정지" : "재생");
    playBtn.querySelector(".icon-play").hidden = active;
    playBtn.querySelector(".icon-pause").hidden = !active;
    playBtn.disabled = !state.playerReady;

    $("repeat-status").textContent = repeatStatusText();
  }

  function repeatStatusText() {
    if (state.mode === "loop") {
      const target = state.settings.repeat;
      if (target === 1) return "한 번 재생";
      const current = target === 0 ? state.repeatDone + 1 : Math.min(state.repeatDone + 1, target);
      return "반복 " + current + " / " + (target === 0 ? "∞" : target);
    }
    if (state.mode === "free") return "자유 재생";
    return "";
  }

  function isActive() {
    return (
      state.playerState === YT_PLAYING ||
      state.playerState === YT_BUFFERING ||
      (state.mode === "loop" && state.phase === "gap")
    );
  }

  function applySettingsUi() {
    const s = state.settings;
    Array.prototype.forEach.call($("seg-repeat").querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String(Number(b.dataset.value) === s.repeat));
    });
    document.body.classList.toggle("hide-en", s.hideEn);
    document.body.classList.toggle("hide-ko", s.hideKo);
    document.body.classList.toggle("hide-reading", !!s.hideReading);
    $("tgl-en").setAttribute("aria-pressed", String(s.hideEn));
    $("tgl-ko").setAttribute("aria-pressed", String(s.hideKo));
    if ($("tgl-reading")) $("tgl-reading").setAttribute("aria-pressed", String(!!s.hideReading));
    if (state.lessonLang === "ja") {
      const cur = state.sentences[state.index];
      const kp = $("cur-kopron");
      if (kp) {
        const showKp = !s.hideReading && cur && !!(cur.ko_pron || "").trim();
        kp.hidden = !showKp;
      }
      const ro = $("cur-romaji");
      if (ro) {
        const showRo = !s.hideReading && cur && !!(cur.romaji || "").trim();
        ro.hidden = !showRo;
      }
    }
    updateSpeedUi();
  }

  function updateSpeedUi() {
    const actual = state.rate;
    const buttons = $("seg-speed").querySelectorAll("button");
    let closest = SPEED_OPTIONS[0];
    SPEED_OPTIONS.forEach(function (r) {
      if (Math.abs(r - actual) < Math.abs(closest - actual)) closest = r;
    });
    Array.prototype.forEach.call(buttons, function (b) {
      b.setAttribute("aria-pressed", String(Number(b.dataset.value) === closest));
    });
    const note = $("speed-note");
    if (Math.abs(actual - state.rateRequested) > 0.001) {
      note.textContent = "이 영상은 " + state.rateRequested + "x를 지원하지 않아 " + actual + "x로 재생해요.";
      note.hidden = false;
    } else if (SPEED_OPTIONS.indexOf(actual) < 0) {
      note.textContent = "현재 속도: " + actual + "x";
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  }

  /* ---------- Controls ---------- */

  function bindControls() {
    $("btn-prev").addEventListener("click", function () {
      if (state.index > 0) playSentence(state.index - 1);
    });
    $("btn-next").addEventListener("click", function () {
      if (state.index < state.sentences.length - 1) playSentence(state.index + 1);
    });
    $("btn-play").addEventListener("click", togglePlay);

    $("seg-repeat").addEventListener("click", function (e) {
      const b = e.target.closest("button[data-value]");
      if (!b) return;
      state.settings.repeat = Number(b.dataset.value);
      saveSettings();
      applySettingsUi();
      updateControls();
    });

    $("seg-speed").addEventListener("click", function (e) {
      const b = e.target.closest("button[data-value]");
      if (!b) return;
      state.settings.speed = Number(b.dataset.value);
      saveSettings();
      applySpeed(state.settings.speed);
    });

    $("tgl-en").addEventListener("click", function () {
      state.settings.hideEn = !state.settings.hideEn;
      saveSettings();
      applySettingsUi();
    });
    $("tgl-ko").addEventListener("click", function () {
      state.settings.hideKo = !state.settings.hideKo;
      saveSettings();
      applySettingsUi();
    });
    if ($("tgl-reading")) {
      $("tgl-reading").addEventListener("click", function () {
        state.settings.hideReading = !state.settings.hideReading;
        saveSettings();
        applySettingsUi();
      });
    }

    // Tap a hidden line in the current panel to peek at it.
    ["cur-en", "cur-ko"].forEach(function (id) {
      $(id).addEventListener("click", function () {
        const lang = this.dataset.lang;
        const hidden = (lang === "en" || lang === "ja") ? state.settings.hideEn : state.settings.hideKo;
        if (hidden) this.classList.toggle("peek");
      });
    });

    const list = $("sentence-list");
    list.addEventListener("click", function (e) {
      const b = e.target.closest(".s-btn");
      if (!b) return;
      playSentence(Number(b.dataset.index), { fromList: true });
    });
    const markUserScroll = function () {
      state.userScrollUntil = Date.now() + 2500;
    };
    list.addEventListener("wheel", markUserScroll, { passive: true });
    list.addEventListener("touchmove", markUserScroll, { passive: true });

    document.addEventListener("keydown", onKeyDown);
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    const onButton = tag === "BUTTON" || tag === "A";

    if ((e.key === " " || e.code === "Space") && !onButton) {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (state.index > 0) playSentence(state.index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (state.index < state.sentences.length - 1) playSentence(state.index + 1);
    }
  }

  /* ---------- Playback engine ---------- */

  function clearGap() {
    if (state.gapTimer) {
      clearTimeout(state.gapTimer);
      state.gapTimer = null;
    }
  }

  // Where to pause: slightly before the segment end so we never leak into the next sentence.
  function stopPoint(seg) {
    const margin = 0.05 + 0.05 * state.rate;
    return Math.max(seg.start + 0.15, seg.end - margin);
  }

  function seekTo(t) {
    try {
      state.player.seekTo(t, true);
    } catch (e) {
      return;
    }
    // getCurrentTime() can report the old position for a moment after seeking.
    state.seekPending = { target: t, until: Date.now() + 1500 };
  }

  function safeCall(method) {
    try {
      if (state.player && typeof state.player[method] === "function") state.player[method]();
    } catch (e) {
      /* player not ready */
    }
  }

  function playSentence(i, opts) {
    if (i < 0 || i >= state.sentences.length) return;
    clearGap();
    state.mode = "loop";
    state.phase = "playing";
    state.repeatDone = 0;
    selectSentence(i, { forceScroll: !(opts && opts.fromList) });
    if (!state.playerReady) {
      updateControls();
      return;
    }
    startSegment();
  }

  function startSegment() {
    const seg = state.sentences[state.index];
    state.phase = "playing";
    seekTo(seg.start);
    safeCall("playVideo");
    updateControls();
  }

  function togglePlay() {
    if (!state.playerReady) return;

    if (state.mode === "loop" && state.phase === "gap") {
      clearGap();
      state.phase = "held";
      updateControls();
      return;
    }
    if (state.playerState === YT_PLAYING || state.playerState === YT_BUFFERING) {
      safeCall("pauseVideo");
      return;
    }
    if (state.mode === "loop" && state.phase === "held") {
      startSegment();
    } else if (state.mode === "loop" || state.mode === "free") {
      safeCall("playVideo");
    } else {
      playSentence(state.index);
    }
  }

  function onSegmentEnd() {
    safeCall("pauseVideo");
    state.repeatDone += 1;
    const target = state.settings.repeat;

    if (target !== 0 && state.repeatDone >= target) {
      // pauseVideo() is async; don't mistake the last PLAYING polls for user-driven free playback.
      state.pausingUntil = Date.now() + 1000;
      state.mode = "idle";
      state.phase = "playing";
      updateControls();
      return;
    }

    state.phase = "gap";
    updateControls();
    clearGap();
    state.gapTimer = setTimeout(function () {
      state.gapTimer = null;
      if (state.mode === "loop" && state.phase === "gap") startSegment();
    }, GAP_MS);
  }

  function enterFreeMode() {
    clearGap();
    state.mode = "free";
    state.phase = "playing";
    state.seekPending = null;
    updateControls();
  }

  // Last sentence whose start is <= t.
  function findIndexAt(t) {
    const list = state.sentences;
    let lo = 0;
    let hi = list.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].start <= t + 0.05) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  function tick() {
    if (!state.playerReady) return;
    let t;
    let ps;
    try {
      t = state.player.getCurrentTime();
      ps = state.player.getPlayerState();
    } catch (e) {
      return;
    }
    if (typeof t !== "number" || !isFinite(t)) return;

    if (state.mode === "loop") {
      tickLoop(t, ps);
      return;
    }
    if (ps === YT_PLAYING) {
      if (Date.now() < state.pausingUntil) return;
      if (state.mode !== "free") enterFreeMode();
      const idx = findIndexAt(t);
      if (idx !== state.index) selectSentence(idx);
    }
  }

  function tickLoop(t, ps) {
    if (state.phase !== "playing") return;
    const seg = state.sentences[state.index];
    const stopAt = stopPoint(seg);

    if (state.seekPending) {
      const sp = state.seekPending;
      if (ps !== YT_PLAYING) sp.until = Math.max(sp.until, Date.now() + 1500);
      if ((t >= sp.target - 0.3 && t < stopAt) || Date.now() > sp.until) {
        state.seekPending = null;
      } else {
        return;
      }
    }

    if (ps !== YT_PLAYING) return;

    // The user dragged the YouTube seek bar far away: hand over to free playback.
    if (t < seg.start - 1.5 || t > seg.end + 3) {
      enterFreeMode();
      const idx = findIndexAt(t);
      if (idx !== state.index) selectSentence(idx);
      return;
    }

    if (t >= stopAt) {
      onSegmentEnd();
      return;
    }
    // Close to the end: schedule an exact check instead of waiting for the next poll.
    const msLeft = ((stopAt - t) / (state.rate || 1)) * 1000;
    if (msLeft < POLL_MS * 1.5 && !state.stopTimer) {
      state.stopTimer = setTimeout(function () {
        state.stopTimer = null;
        tick();
      }, Math.max(0, msLeft));
    }
  }

  /* ---------- Speed ---------- */

  function applySpeed(requested) {
    state.rateRequested = requested;
    if (!state.playerReady) {
      state.rate = requested;
      updateSpeedUi();
      return;
    }
    let rates = [];
    try {
      rates = state.player.getAvailablePlaybackRates() || [];
    } catch (e) {
      rates = [];
    }
    let target = requested;
    if (rates.length && rates.indexOf(requested) < 0) {
      target = rates.reduce(function (best, r) {
        return Math.abs(r - requested) < Math.abs(best - requested) ? r : best;
      }, rates[0]);
    }
    try {
      state.player.setPlaybackRate(target);
    } catch (e) {
      /* ignore */
    }
    state.rate = target;
    updateSpeedUi();
    setTimeout(syncRateFromPlayer, 400);
  }

  function syncRateFromPlayer() {
    try {
      const r = state.player.getPlaybackRate();
      if (typeof r === "number" && r > 0) state.rate = r;
    } catch (e) {
      /* ignore */
    }
    updateSpeedUi();
  }

  /* ---------- YouTube player ---------- */

  function showVideoStatus(message, isError) {
    const el = $("video-status");
    el.textContent = message;
    el.classList.toggle("error", !!isError);
    el.hidden = false;
  }

  function loadYouTubeApi(videoId) {
    if (window.YT && window.YT.Player) {
      createPlayer(videoId);
      return;
    }
    window.onYouTubeIframeAPIReady = function () {
      createPlayer(videoId);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = function () {
      showVideoStatus("유튜브 플레이어를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 새로고침해 주세요.", true);
    };
    document.head.appendChild(tag);
    state.apiTimeout = setTimeout(function () {
      if (!state.playerReady) {
        showVideoStatus("유튜브 플레이어가 응답하지 않아요. 인터넷 연결을 확인한 뒤 새로고침해 주세요.", true);
      }
    }, 20000);
  }

  function createPlayer(videoId) {
    state.player = new window.YT.Player("player", {
      videoId: videoId,
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 0,
        cc_load_policy: 0,
        iv_load_policy: 3,
        rel: 0,
        playsinline: 1,
        modestbranding: 1,
        enablejsapi: 1,
        hl: "ko",
        origin: location.origin,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
        onPlaybackRateChange: function (e) {
          if (typeof e.data === "number") {
            state.rate = e.data;
            updateSpeedUi();
          }
        },
      },
    });
  }

  function hideCaptions() {
    try {
      if (state.player && typeof state.player.unloadModule === "function") {
        state.player.unloadModule("captions");
        state.player.unloadModule("cc");
      }
    } catch (e) {
      /* not supported – our own panel shows the captions anyway */
    }
  }

  function onPlayerReady() {
    clearTimeout(state.apiTimeout);
    state.playerReady = true;
    $("video-status").hidden = true;
    applySpeed(state.settings.speed);
    if (!state.pollTimer) state.pollTimer = setInterval(tick, POLL_MS);
    // A sentence tapped before the player was ready starts now.
    if (state.mode === "loop") startSegment();
    updateControls();
  }

  let firstPlay = true;
  function onPlayerStateChange(e) {
    state.playerState = e.data;
    if (e.data === YT_PLAYING) {
      hideCaptions();
      if (firstPlay) {
        firstPlay = false;
        // Some players only accept the playback rate once the video is actually playing.
        applySpeed(state.rateRequested);
      }
    }
    if (e.data === YT_PAUSED || e.data === YT_ENDED) state.pausingUntil = 0;
    if (e.data === YT_ENDED) {
      clearGap();
      state.mode = "idle";
      state.phase = "playing";
    }
    updateControls();
  }

  function onPlayerError(e) {
    const messages = {
      2: "영상 주소(ID)가 올바르지 않아요.",
      5: "브라우저에서 이 영상을 재생할 수 없어요.",
      100: "영상을 찾을 수 없어요. 삭제되었거나 비공개일 수 있어요.",
      101: "영상 소유자가 다른 사이트에서의 재생을 허용하지 않았어요.",
      150: "영상 소유자가 다른 사이트에서의 재생을 허용하지 않았어요.",
    };
    const msg = messages[e && e.data] || "영상을 재생하는 중 오류가 발생했어요.";
    showVideoStatus(msg + " (오류 코드 " + (e && e.data) + ") 문장 목록은 계속 볼 수 있어요.", true);
    clearGap();
    state.mode = "idle";
    updateControls();
  }

  /* ======================= Boot ======================= */

  function boot() {
    const page = document.body.dataset.page;
    if (page === "home") initHome();
    else if (page === "lesson") initLesson();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
