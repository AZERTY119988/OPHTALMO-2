/* =========================================================
   Ataraxie Ophtalmologie — Interactive QCM Application
   ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "ataraxie_ophtalmo_state_v1";
  const THEME_KEY = "ataraxie_ophtalmo_theme";

  const DATA = window.ATARAXIE_DATA;
  const COURS = window.COURS_V6 || [];

  if (!DATA) {
    document.getElementById("stageTitle").textContent =
      "Données QCM introuvables (qcm-data.js)";
    return;
  }

  // Persistent user state
  let saved = loadState();

  // Ephemeral UI state
  const ui = {
    mode: "cpc", // "cpc" | "tape"
    selectedKey: "ALL", // chapterNum (number) or "ALL" in CPC; examId (string) or "ALL" in Tapé
    filter: "all", // "all" | "grid" | "unanswered" | "wrong" | "bookmarked"
    search: "",
    viewMode: "focus", // "focus" | "list"
    focusIndex: 0,
    draftSelections: {}, // qId -> Set of letters
    openJustifs: {}, // `${qId}:${letter}` -> boolean
    openQrAnswers: {}, // qId -> boolean
    examSim: {
      active: false,
      startedAt: 0,
      timerId: null,
      finishedSummary: null,
    },
  };

  // DOM references
  const el = {
    tabCpc: document.getElementById("tabCpc"),
    tabTape: document.getElementById("tabTape"),
    countCpc: document.getElementById("countCpc"),
    countTape: document.getElementById("countTape"),
    btnSidebarToggle: document.getElementById("btnSidebarToggle"),
    sidebar: document.getElementById("sidebar"),
    sidebarBackdrop: document.getElementById("sidebarBackdrop"),
    globalProgressText: document.getElementById("globalProgressText"),
    globalProgressBar: document.getElementById("globalProgressBar"),
    globalStrictScore: document.getElementById("globalStrictScore"),
    globalPropAccuracy: document.getElementById("globalPropAccuracy"),
    searchInput: document.getElementById("searchInput"),
    sidebarFilters: document.getElementById("sidebarFilters"),
    sidebarListTitle: document.getElementById("sidebarListTitle"),
    btnSelectAll: document.getElementById("btnSelectAll"),
    sidebarList: document.getElementById("sidebarList"),
    btnResetProgress: document.getElementById("btnResetProgress"),
    stageKicker: document.getElementById("stageKicker"),
    stageTitle: document.getElementById("stageTitle"),
    stageMeta: document.getElementById("stageMeta"),
    btnViewExamGrid: document.getElementById("btnViewExamGrid"),
    btnViewFocus: document.getElementById("btnViewFocus"),
    btnViewList: document.getElementById("btnViewList"),
    btnExamSim: document.getElementById("btnExamSim"),
    btnExamSimLabel: document.getElementById("btnExamSimLabel"),
    examSimBar: document.getElementById("examSimBar"),
    examSimProgress: document.getElementById("examSimProgress"),
    examSimTimer: document.getElementById("examSimTimer"),
    btnFinishExam: document.getElementById("btnFinishExam"),
    btnCancelExam: document.getElementById("btnCancelExam"),
    questionNavStrip: document.getElementById("questionNavStrip"),
    questionsContainer: document.getElementById("questionsContainer"),
    focusFooter: document.getElementById("focusFooter"),
    btnPrevQ: document.getElementById("btnPrevQ"),
    btnNextQ: document.getElementById("btnNextQ"),
    focusCounter: document.getElementById("focusCounter"),
    btnTheme: document.getElementById("btnTheme"),
    iconSun: document.getElementById("iconSun"),
    iconMoon: document.getElementById("iconMoon"),
    gridModal: document.getElementById("gridModal"),
    gridModalTitle: document.getElementById("gridModalTitle"),
    gridModalSub: document.getElementById("gridModalSub"),
    gridModalNote: document.getElementById("gridModalNote"),
    gridModalImg: document.getElementById("gridModalImg"),
    btnOpenCours: document.getElementById("btnOpenCours"),
    coursDrawer: document.getElementById("coursDrawer"),
    coursChapterSelect: document.getElementById("coursChapterSelect"),
    coursSearchInput: document.getElementById("coursSearchInput"),
    coursReaderBody: document.getElementById("coursReaderBody"),
  };

  // =========================================================
  // State Persistence & Helpers
  // =========================================================
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          answers: parsed.answers || {}, // qId -> { selected: [], perfect: bool, propCorrect: n, propTotal: n }
          bookmarks: parsed.bookmarks || {}, // qId -> true
        };
      }
    } catch (_) {}
    return { answers: {}, bookmarks: {} };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (_) {}
  }

  function initTheme() {
    const t = localStorage.getItem(THEME_KEY) || "light";
    applyTheme(t);
  }

  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    el.iconSun.style.display = t === "dark" ? "none" : "block";
    el.iconMoon.style.display = t === "dark" ? "block" : "none";
    localStorage.setItem(THEME_KEY, t);
  }

  function escHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeText(str) {
    return (str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getAllQuestionsForMode(mode) {
    if (mode === "cpc") return DATA.cpcQuestions || [];
    const list = [];
    for (const ex of DATA.tapeExams || []) {
      for (const q of ex.questions || []) list.push(q);
    }
    return list;
  }

  function questionHasGrid(q) {
    if (ui.mode === "cpc") {
      return q.gridCoverage === "full" || q.gridCoverage === "partial";
    }
    return Boolean(q.hasOfficialGrid);
  }

  function getFilteredQuestions() {
    let list = [];
    if (ui.mode === "cpc") {
      list = DATA.cpcQuestions || [];
      if (ui.selectedKey !== "ALL") {
        list = list.filter((q) => q.chapterNum === ui.selectedKey);
      }
    } else {
      if (ui.selectedKey === "ALL") {
        list = getAllQuestionsForMode("tape");
      } else {
        const ex = (DATA.tapeExams || []).find((e) => e.examId === ui.selectedKey);
        list = ex ? ex.questions : [];
      }
    }

    if (ui.filter === "grid") {
      list = list.filter(questionHasGrid);
    } else if (ui.filter === "unanswered") {
      list = list.filter((q) => q.type === "QCM" && !saved.answers[q.id]);
    } else if (ui.filter === "wrong") {
      list = list.filter((q) => saved.answers[q.id] && !saved.answers[q.id].perfect);
    } else if (ui.filter === "bookmarked") {
      list = list.filter((q) => Boolean(saved.bookmarks[q.id]));
    }

    const qStr = normalizeText(ui.search.trim());
    if (qStr) {
      list = list.filter((q) => {
        if (normalizeText(q.stem).includes(qStr)) return true;
        if (normalizeText(q.clinicalCase).includes(qStr)) return true;
        if (normalizeText(q.chapterTitle || q.matchedChapterTitle || "").includes(qStr)) return true;
        if (normalizeText(q.examId || "").includes(qStr)) return true;
        for (const p of q.propositions || []) {
          if (normalizeText(p.text).includes(qStr)) return true;
          if (normalizeText(p.justification).includes(qStr)) return true;
        }
        return false;
      });
    }

    return list;
  }

  function gradeQuestion(q, selectedArr) {
    const selSet = new Set(selectedArr);
    const props = q.propositions || [];
    let propCorrect = 0;
    let exactMatch = true;
    for (const p of props) {
      const picked = selSet.has(p.letter);
      const isRight = Boolean(p.correct);
      if (picked === isRight) propCorrect++;
      else exactMatch = false;
    }
    return {
      selected: Array.from(selSet).sort(),
      perfect: exactMatch && props.length > 0,
      propCorrect,
      propTotal: props.length,
    };
  }

  // =========================================================
  // Sidebar & Global Stats Rendering
  // =========================================================
  function renderGlobalStats() {
    const allQs = getAllQuestionsForMode(ui.mode).filter((q) => q.type === "QCM");
    let done = 0;
    let strictPerfect = 0;
    let propRightSum = 0;
    let propTotSum = 0;

    for (const q of allQs) {
      const a = saved.answers[q.id];
      if (a) {
        done++;
        if (a.perfect) strictPerfect++;
        propRightSum += a.propCorrect || 0;
        propTotSum += a.propTotal || 0;
      }
    }

    const pct = allQs.length ? Math.round((done / allQs.length) * 100) : 0;
    el.globalProgressText.textContent = `${done} / ${allQs.length} (${pct}%)`;
    el.globalProgressBar.style.width = `${pct}%`;
    el.globalStrictScore.textContent = done ? `${strictPerfect}/${done} (${Math.round((strictPerfect / done) * 100)}%)` : "—";
    el.globalPropAccuracy.textContent = propTotSum ? `${Math.round((propRightSum / propTotSum) * 100)}%` : "—";
  }

  function renderSidebar() {
    el.sidebarList.innerHTML = "";
    const frag = document.createDocumentFragment();

    if (ui.mode === "cpc") {
      el.sidebarListTitle.textContent = "Chapitres CPC (24)";
      let lastPart = "";

      for (const ch of DATA.cpcChapters || []) {
        if (ch.part && ch.part !== lastPart) {
          lastPart = ch.part;
          const pLbl = document.createElement("div");
          pLbl.className = "sidebar-part-label";
          pLbl.textContent = ch.part;
          frag.appendChild(pLbl);
        }

        const chQs = DATA.cpcQuestions.filter((q) => q.chapterNum === ch.num);
        const qcmCount = chQs.filter((q) => q.type === "QCM").length;
        const doneCount = chQs.filter((q) => saved.answers[q.id]).length;
        const gridCount = chQs.filter((q) => q.gridCoverage === "full" || q.gridCoverage === "partial").length;
        const pct = qcmCount ? Math.round((doneCount / qcmCount) * 100) : 0;

        const btn = document.createElement("button");
        btn.className = "nav-item" + (ui.selectedKey === ch.num ? " active" : "");
        btn.innerHTML = `
          <div class="nav-item-top">
            <span class="nav-item-title">${escHtml(ch.title)}</span>
            <span class="nav-item-badges">
              ${gridCount > 0 ? `<span class="mini-pill mini-pill-grid" title="${gridCount} QCM avec grille officielle">✓ ${gridCount}</span>` : ""}
              <span class="mini-pill">${chQs.length}</span>
            </span>
          </div>
          <div class="nav-item-bar"><div class="nav-item-bar-fill" style="width:${pct}%"></div></div>
        `;
        btn.addEventListener("click", () => {
          exitExamSimIfNeeded();
          ui.selectedKey = ch.num;
          ui.focusIndex = 0;
          closeMobileSidebar();
          renderAll();
        });
        frag.appendChild(btn);
      }
    } else {
      el.sidebarListTitle.textContent = `Sessions Tapé (${(DATA.tapeExams || []).length})`;
      for (const ex of DATA.tapeExams || []) {
        const qs = ex.questions || [];
        const qcmQs = qs.filter((q) => q.type === "QCM");
        const doneCount = qcmQs.filter((q) => saved.answers[q.id]).length;
        const pct = qcmQs.length ? Math.round((doneCount / qcmQs.length) * 100) : 0;

        const btn = document.createElement("button");
        btn.className = "nav-item" + (ui.selectedKey === ex.examId ? " active" : "");
        btn.innerHTML = `
          <div class="nav-item-top">
            <span class="nav-item-title">Examen ${escHtml(ex.examId)}</span>
            <span class="nav-item-badges">
              ${ex.hasOfficialGrid ? `<span class="mini-pill mini-pill-grid" title="Correction officielle disponible">✓ Grille</span>` : ""}
              <span class="mini-pill">${qs.length}</span>
            </span>
          </div>
          <div class="nav-item-bar"><div class="nav-item-bar-fill" style="width:${pct}%"></div></div>
        `;
        btn.addEventListener("click", () => {
          exitExamSimIfNeeded();
          ui.selectedKey = ex.examId;
          ui.focusIndex = 0;
          closeMobileSidebar();
          renderAll();
        });
        frag.appendChild(btn);
      }
    }

    el.sidebarList.appendChild(frag);
  }

  // =========================================================
  // Main Stage Rendering
  // =========================================================
  function renderStageHeader(filtered) {
    el.btnViewExamGrid.style.display = "none";

    if (ui.mode === "cpc") {
      el.stageKicker.textContent = "MODE CPC · COURS PAR COURS";
      if (ui.selectedKey === "ALL") {
        el.stageTitle.textContent = "Tous les chapitres d'Ophtalmologie";
      } else {
        const ch = (DATA.cpcChapters || []).find((c) => c.num === ui.selectedKey);
        el.stageTitle.textContent = ch ? ch.title : "Chapitre";
      }
      const gridCnt = filtered.filter((q) => q.gridCoverage === "full" || q.gridCoverage === "partial").length;
      const qrCnt = filtered.filter((q) => q.type === "QR").length;
      el.stageMeta.textContent = `${filtered.length} question${filtered.length > 1 ? "s" : ""} affichée${filtered.length > 1 ? "s" : ""} · ${gridCnt} avec grille officielle${qrCnt ? ` · ${qrCnt} QR` : ""}`;
    } else {
      el.stageKicker.textContent = "MODE TAPÉ · ANNALES D'EXAMEN";
      if (ui.selectedKey === "ALL") {
        el.stageTitle.textContent = "Toutes les sessions (2016–2026)";
        el.stageMeta.textContent = `${filtered.length} questions · 13 sessions avec grilles officielles`;
      } else {
        const ex = (DATA.tapeExams || []).find((e) => e.examId === ui.selectedKey);
        el.stageTitle.textContent = `Examen Ophtalmologie — ${ui.selectedKey}`;
        el.stageMeta.textContent = ex && ex.hasOfficialGrid
          ? `${filtered.length} questions · Correction officielle certifiée par grille scannée`
          : `${filtered.length} questions · Correction basée sur le support Ophtalmologie V6`;
        if (ex && ex.hasOfficialGrid && DATA.officialGrids[ex.examId]) {
          el.btnViewExamGrid.style.display = "inline-flex";
          el.btnViewExamGrid.onclick = () => openGridModal(ex.examId, null);
        }
      }
    }
  }

  function renderNavStrip(filtered) {
    if (ui.viewMode !== "focus" || filtered.length === 0) {
      el.questionNavStrip.style.display = "none";
      return;
    }
    el.questionNavStrip.style.display = "flex";
    el.questionNavStrip.innerHTML = "";
    const frag = document.createDocumentFragment();

    filtered.forEach((q, idx) => {
      const btn = document.createElement("button");
      let cls = "q-dot";
      if (idx === ui.focusIndex) cls += " current";
      if (ui.examSim.active) {
        const draft = ui.draftSelections[q.id];
        if (draft && draft.size > 0) cls += " status-pending";
      } else {
        const a = saved.answers[q.id];
        if (a) cls += a.perfect ? " status-perfect" : " status-wrong";
      }
      btn.className = cls;
      btn.textContent = ui.mode === "tape" && ui.selectedKey !== "ALL" ? `Q${q.qNum}` : `${idx + 1}`;
      btn.title = `Question ${idx + 1}`;
      btn.addEventListener("click", () => {
        ui.focusIndex = idx;
        renderQuestions(filtered);
        renderNavStrip(filtered);
      });
      frag.appendChild(btn);
    });
    el.questionNavStrip.appendChild(frag);
  }

  function renderQuestions(filtered) {
    el.questionsContainer.innerHTML = "";

    // Exam simulation summary banner if just completed
    if (ui.examSim.finishedSummary) {
      const s = ui.examSim.finishedSummary;
      const card = document.createElement("div");
      card.className = "exam-summary-card";
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div>
            <div class="stage-kicker">RÉSULTAT DE LA SIMULATION</div>
            <h2 style="margin:0;font-size:19px">Correction terminée — Barème strict</h2>
          </div>
          <button id="btnDismissSummary" class="btn btn-subtle">Fermer ce résumé</button>
        </div>
        <div class="exam-summary-grid">
          <div class="summary-kpi">
            <div class="summary-kpi-val">${s.perfect} / ${s.total}</div>
            <div class="summary-kpi-lbl">Note stricte (${Math.round((s.perfect / Math.max(1, s.total)) * 20 * 10) / 10} / 20)</div>
          </div>
          <div class="summary-kpi">
            <div class="summary-kpi-val">${s.propPct}%</div>
            <div class="summary-kpi-lbl">Propositions justes (${s.propCorrect}/${s.propTotal})</div>
          </div>
          <div class="summary-kpi">
            <div class="summary-kpi-val">${s.duration}</div>
            <div class="summary-kpi-lbl">Temps écoulé</div>
          </div>
        </div>
      `;
      el.questionsContainer.appendChild(card);
      card.querySelector("#btnDismissSummary").addEventListener("click", () => {
        ui.examSim.finishedSummary = null;
        renderQuestions(filtered);
      });
    }

    if (filtered.length === 0) {
      el.focusFooter.style.display = "none";
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
        <h3>Aucune question ne correspond à ces critères</h3>
        <p>Essayez de réinitialiser le filtre ou la recherche.</p>
      `;
      el.questionsContainer.appendChild(empty);
      return;
    }

    if (ui.focusIndex >= filtered.length) ui.focusIndex = 0;

    if (ui.viewMode === "focus") {
      el.focusFooter.style.display = "flex";
      const q = filtered[ui.focusIndex];
      el.questionsContainer.appendChild(buildQuestionCard(q, ui.focusIndex, filtered));
      el.focusCounter.textContent = `Question ${ui.focusIndex + 1} / ${filtered.length}`;
      el.btnPrevQ.disabled = ui.focusIndex === 0;
      el.btnNextQ.disabled = ui.focusIndex === filtered.length - 1;
    } else {
      el.focusFooter.style.display = "none";
      const frag = document.createDocumentFragment();
      // In list mode, render up to 80 at once with a "Charger la suite" button if large
      const limit = ui._listLimit || 40;
      const slice = filtered.slice(0, limit);
      slice.forEach((q, idx) => frag.appendChild(buildQuestionCard(q, idx, filtered)));
      el.questionsContainer.appendChild(frag);
      if (filtered.length > limit) {
        const moreBtn = document.createElement("button");
        moreBtn.className = "btn btn-subtle";
        moreBtn.style.alignSelf = "center";
        moreBtn.textContent = `Afficher plus (${filtered.length - limit} restantes)`;
        moreBtn.addEventListener("click", () => {
          ui._listLimit = limit + 40;
          renderQuestions(filtered);
        });
        el.questionsContainer.appendChild(moreBtn);
      }
    }
  }

  function buildQuestionCard(q, idx, filtered) {
    const card = document.createElement("article");
    card.className = "q-card";
    card.dataset.qid = q.id;

    const ans = ui.examSim.active ? null : saved.answers[q.id];
    const isAnswered = Boolean(ans);
    const isBookmarked = Boolean(saved.bookmarks[q.id]);

    if (!ui.draftSelections[q.id]) {
      ui.draftSelections[q.id] = new Set(ans ? ans.selected : []);
    }
    const selSet = ui.draftSelections[q.id];

    // Determine source grid exam to link to in modal
    let primaryGridExam = null;
    let primaryGridQNum = null;
    if (ui.mode === "tape" && q.hasOfficialGrid) {
      primaryGridExam = q.examId;
      primaryGridQNum = q.qNum;
    } else if (ui.mode === "cpc" && q.sourceExams) {
      const gEx = q.sourceExams.find((s) => s.hasOfficialGrid && DATA.officialGrids[s.examId]);
      if (gEx) {
        primaryGridExam = gEx.examId;
        primaryGridQNum = gEx.qNum;
      }
    }

    // Header badges
    let badgesHtml = "";
    const qLabel = ui.mode === "tape" ? `${q.examId} · Q${q.qNum}` : `Q${q.qNum}`;
    badgesHtml += `<span class="badge badge-qnum">${escHtml(qLabel)}</span>`;

    if (q.type === "QR") {
      badgesHtml += `<span class="badge badge-course">Question rédactionnelle (QR)</span>`;
    } else if (ui.mode === "cpc") {
      if (q.gridCoverage === "full") {
        badgesHtml += `<button class="badge badge-official" data-open-grid="${escHtml(primaryGridExam || "")}" data-grid-q="${primaryGridQNum || ""}" title="Cliquer pour voir la grille officielle scannée">✓ Grille officielle</button>`;
      } else if (q.gridCoverage === "partial") {
        badgesHtml += `<button class="badge badge-partial" data-open-grid="${escHtml(primaryGridExam || "")}" data-grid-q="${primaryGridQNum || ""}" title="Certaines propositions proviennent d'une grille officielle">✓ Grille partielle + V6</button>`;
      } else {
        badgesHtml += `<span class="badge badge-course">Support Ophtalmologie V6</span>`;
      }
      if (q.sourceExams && q.sourceExams.length > 0) {
        const tags = q.sourceExams.slice(0, 3).map((s) => `${s.examId} Q${s.qNum}`).join(" · ");
        badgesHtml += `<span class="badge badge-exam">${escHtml(tags)}${q.sourceExams.length > 3 ? ` +${q.sourceExams.length - 3}` : ""}</span>`;
      }
    } else {
      if (q.hasOfficialGrid) {
        badgesHtml += `<button class="badge badge-official" data-open-grid="${escHtml(q.examId)}" data-grid-q="${q.qNum}" title="Cliquer pour voir la grille officielle scannée">✓ Grille officielle</button>`;
      } else {
        badgesHtml += `<span class="badge badge-course">Support Ophtalmologie V6</span>`;
      }
      if (q.matchedChapterTitle) {
        badgesHtml += `<span class="badge badge-exam">${escHtml(q.matchedChapterTitle)}</span>`;
      }
    }

    if (q.subSection) {
      badgesHtml += `<span class="badge badge-exam">${escHtml(q.subSection)}</span>`;
    }

    // Header HTML
    let html = `
      <div class="q-card-header">
        <div class="q-badges">${badgesHtml}</div>
        <div class="q-header-tools">
          <button class="bookmark-btn ${isBookmarked ? "active" : ""}" data-action="bookmark" title="Marquer cette question (Favori)" aria-label="Favori">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="${isBookmarked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </button>
        </div>
      </div>
    `;

    // Clinical case context
    if (q.clinicalCase) {
      html += `
        <div class="clinical-case-box">
          <div class="clinical-case-label">Contexte clinique</div>
          <div>${escHtml(q.clinicalCase)}</div>
        </div>
      `;
    }

    // Question stem
    html += `<div class="q-stem">${escHtml(q.stem)}</div>`;

    // Official grid notes (e.g. "b : retirée du barème")
    const notes = q.officialGridNotes && q.officialGridNotes.length
      ? q.officialGridNotes.join(" · ")
      : (q.officialNote || "");
    if (notes) {
      html += `<div class="q-official-note"><strong>Note grille officielle :</strong> ${escHtml(notes)}</div>`;
    }

    if (q.type === "QR") {
      const openQr = Boolean(ui.openQrAnswers[q.id]);
      html += `
        <div class="qr-body">
          <button class="btn btn-outline-accent" data-action="toggle-qr">
            ${openQr ? "Masquer les éléments de réponse" : "Afficher les éléments de réponse (Ophtalmologie V6)"}
          </button>
          ${openQr ? `
            <div class="qr-answer-box">
              <div>${escHtml(q.qrCorrection || "Référez-vous au chapitre correspondant dans le support Ophtalmologie V6.")}</div>
              ${q.qrCourseRef ? `<div style="margin-top:8px;font-weight:700;color:var(--indigo)">📘 ${escHtml(q.qrCourseRef)}</div>` : ""}
            </div>
          ` : ""}
        </div>
      `;
    } else {
      // QCM Propositions
      html += `<div class="props-list">`;
      for (const p of q.propositions || []) {
        const picked = selSet.has(p.letter);
        const isCorrect = Boolean(p.correct);
        const jKey = `${q.id}:${p.letter}`;
        const jOpen = !ui.examSim.active && Boolean(ui.openJustifs[jKey]);

        let stateCls = "";
        let verdictInline = "";
        if (isAnswered) {
          if (isCorrect && picked) {
            stateCls = "state-correct-picked";
            verdictInline = `<div class="prop-verdict-inline verdict-true">✓ Bonne réponse (cochée)</div>`;
          } else if (isCorrect && !picked) {
            stateCls = "state-correct-missed";
            verdictInline = `<div class="prop-verdict-inline verdict-true">✓ Bonne réponse (oubliée)</div>`;
          } else if (!isCorrect && picked) {
            stateCls = "state-wrong-picked";
            verdictInline = `<div class="prop-verdict-inline verdict-false">✕ Proposition fausse (cochée à tort)</div>`;
          } else {
            stateCls = "state-wrong-unpicked";
          }
        } else if (picked) {
          stateCls = "selected";
        }

        const hasGridVerdict = p.officialGridVerdict === true || p.officialGridVerdict === false;
        const gridSrcText = (p.officialGridSources && p.officialGridSources.length)
          ? p.officialGridSources.slice(0, 2).join(", ")
          : (q.hasOfficialGrid ? `${q.examId} Q${q.qNum} (${p.letter})` : "");

        html += `
          <div class="prop-wrapper ${stateCls}">
            <div class="prop-row">
              <div class="prop-select-area" data-action="toggle-prop" data-letter="${escHtml(p.letter)}" role="checkbox" aria-checked="${picked}" tabindex="0">
                <div class="prop-letter">${escHtml(p.letter)}</div>
                <div class="prop-text-col">
                  <div class="prop-text">${escHtml(p.text)}</div>
                  ${verdictInline}
                </div>
              </div>
              ${!ui.examSim.active ? `
                <button class="btn-justif ${jOpen ? "open" : ""}" data-action="toggle-justif" data-letter="${escHtml(p.letter)}" title="Afficher la justification du cours Ophtalmologie V6">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  <span>Justification</span>
                </button>
              ` : ""}
            </div>
            ${jOpen ? `
              <div class="prop-justif-panel">
                <div class="justif-meta-row">
                  <span class="justif-verdict-pill ${isCorrect ? "is-true" : "is-false"}">${isCorrect ? "VRAI" : "FAUX"}</span>
                  ${hasGridVerdict
                    ? `<span class="justif-source-pill is-grid">✓ Grille officielle${gridSrcText ? ` · ${escHtml(gridSrcText)}` : ""}</span>`
                    : `<span class="justif-source-pill">📘 Support Ophtalmologie V6</span>`
                  }
                </div>
                <p class="justif-body">${escHtml(p.justification || "Voir le support Ophtalmologie V6.")}</p>
                ${(p.courseRef || p.courseExcerpt) ? `
                  <div class="justif-course-box">
                    <div class="justif-course-ref">
                      <span>📘 ${escHtml(p.courseRef || "Ophtalmologie V6")}</span>
                      ${extractPageNum(p.courseRef) ? `<button class="btn-open-v6-inline" data-open-v6-page="${extractPageNum(p.courseRef)}">Ouvrir p. ${extractPageNum(p.courseRef)} →</button>` : ""}
                    </div>
                    ${p.courseExcerpt ? `<div class="justif-course-excerpt">« ${escHtml(p.courseExcerpt)} »</div>` : ""}
                  </div>
                ` : ""}
              </div>
            ` : ""}
          </div>
        `;
      }
      html += `</div>`;

      // Card Footer
      const allJustifsOpen = (q.propositions || []).every((p) => ui.openJustifs[`${q.id}:${p.letter}`]);
      const rightLetters = (q.propositions || []).filter((p) => p.correct).map((p) => p.letter).join(", ") || "Aucune";

      html += `<div class="q-card-footer">`;
      if (ui.examSim.active) {
        html += `
          <div class="q-footer-left">
            <span style="font-size:13px;color:var(--text-3)">${selSet.size > 0 ? `Sélectionné : <strong>${Array.from(selSet).sort().join(", ")}</strong>` : "Cochez les propositions justes"}</span>
          </div>
          <div class="q-footer-right">
            <button class="btn btn-subtle" data-action="clear-draft">Effacer</button>
          </div>
        `;
      } else if (!isAnswered) {
        html += `
          <div class="q-footer-left">
            <button class="btn btn-primary" data-action="validate">Valider ma réponse</button>
            <button class="btn btn-subtle" data-action="reveal">Voir la correction</button>
          </div>
          <div class="q-footer-right">
            <button class="btn btn-subtle" data-action="toggle-all-justifs">${allJustifsOpen ? "Masquer justifications" : "Tout justifier"}</button>
          </div>
        `;
      } else {
        html += `
          <div class="q-footer-left">
            <div class="q-result-banner ${ans.perfect ? "perfect" : "wrong"}">
              ${ans.perfect ? "✓ Parfait (Barème strict : 1/1)" : `✕ Réponse attendue : ${escHtml(rightLetters)} (${ans.propCorrect}/${ans.propTotal} items)`}
            </div>
          </div>
          <div class="q-footer-right">
            <button class="btn btn-subtle" data-action="toggle-all-justifs">${allJustifsOpen ? "Masquer justifications" : "Tout justifier"}</button>
            <button class="btn btn-subtle" data-action="retry">Refaire</button>
          </div>
        `;
      }
      html += `</div>`;
    }

    card.innerHTML = html;

    // Bind events inside card
    card.addEventListener("click", (e) => {
      const gridBtn = e.target.closest("[data-open-grid]");
      if (gridBtn && gridBtn.dataset.openGrid) {
        openGridModal(gridBtn.dataset.openGrid, gridBtn.dataset.gridQ || null);
        return;
      }

      const v6Btn = e.target.closest("[data-open-v6-page]");
      if (v6Btn) {
        openCoursDrawerAtPage(parseInt(v6Btn.dataset.openV6Page, 10));
        return;
      }

      const actionEl = e.target.closest("[data-action]");
      if (!actionEl) return;
      const act = actionEl.dataset.action;

      if (act === "bookmark") {
        if (saved.bookmarks[q.id]) delete saved.bookmarks[q.id];
        else saved.bookmarks[q.id] = true;
        saveState();
        renderAll();
      } else if (act === "toggle-qr") {
        ui.openQrAnswers[q.id] = !ui.openQrAnswers[q.id];
        renderQuestions(filtered);
      } else if (act === "toggle-prop") {
        if (isAnswered && !ui.examSim.active) return;
        const lettr = actionEl.dataset.letter;
        if (selSet.has(lettr)) selSet.delete(lettr);
        else selSet.add(lettr);
        if (ui.examSim.active) updateExamSimProgress(filtered);
        renderQuestions(filtered);
        renderNavStrip(filtered);
      } else if (act === "toggle-justif") {
        const lettr = actionEl.dataset.letter;
        const k = `${q.id}:${lettr}`;
        ui.openJustifs[k] = !ui.openJustifs[k];
        renderQuestions(filtered);
      } else if (act === "toggle-all-justifs") {
        const allOpen = (q.propositions || []).every((p) => ui.openJustifs[`${q.id}:${p.letter}`]);
        for (const p of q.propositions || []) {
          ui.openJustifs[`${q.id}:${p.letter}`] = !allOpen;
        }
        renderQuestions(filtered);
      } else if (act === "validate") {
        saved.answers[q.id] = gradeQuestion(q, Array.from(selSet));
        saveState();
        renderAll();
      } else if (act === "reveal") {
        saved.answers[q.id] = gradeQuestion(q, Array.from(selSet));
        for (const p of q.propositions || []) {
          ui.openJustifs[`${q.id}:${p.letter}`] = true;
        }
        saveState();
        renderAll();
      } else if (act === "retry") {
        delete saved.answers[q.id];
        ui.draftSelections[q.id] = new Set();
        for (const p of q.propositions || []) delete ui.openJustifs[`${q.id}:${p.letter}`];
        saveState();
        renderAll();
      } else if (act === "clear-draft") {
        ui.draftSelections[q.id] = new Set();
        updateExamSimProgress(filtered);
        renderQuestions(filtered);
        renderNavStrip(filtered);
      }
    });

    return card;
  }

  function extractPageNum(ref) {
    if (!ref) return null;
    const m = String(ref).match(/p\.\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  // =========================================================
  // Exam Simulation Mode
  // =========================================================
  function startExamSim() {
    const filtered = getFilteredQuestions().filter((q) => q.type === "QCM");
    if (filtered.length === 0) return;
    ui.examSim.active = true;
    ui.examSim.finishedSummary = null;
    ui.examSim.startedAt = Date.now();
    for (const q of filtered) {
      ui.draftSelections[q.id] = new Set();
    }
    el.examSimBar.style.display = "flex";
    el.btnExamSimLabel.textContent = "En cours...";
    el.btnExamSim.disabled = true;
    updateExamSimProgress(filtered);
    clearInterval(ui.examSim.timerId);
    ui.examSim.timerId = setInterval(() => {
      el.examSimTimer.textContent = formatDuration(Date.now() - ui.examSim.startedAt);
    }, 1000);
    el.examSimTimer.textContent = "00:00";
    renderAll();
  }

  function updateExamSimProgress(filtered) {
    const qcms = filtered.filter((q) => q.type === "QCM");
    const touched = qcms.filter((q) => ui.draftSelections[q.id] && ui.draftSelections[q.id].size > 0).length;
    el.examSimProgress.textContent = `${touched} / ${qcms.length} répondues`;
  }

  function finishExamSim() {
    const filtered = getFilteredQuestions().filter((q) => q.type === "QCM");
    let perfect = 0;
    let propCorrect = 0;
    let propTotal = 0;

    for (const q of filtered) {
      const sel = ui.draftSelections[q.id] ? Array.from(ui.draftSelections[q.id]) : [];
      const res = gradeQuestion(q, sel);
      saved.answers[q.id] = res;
      if (res.perfect) perfect++;
      propCorrect += res.propCorrect;
      propTotal += res.propTotal;
    }
    saveState();

    const duration = formatDuration(Date.now() - ui.examSim.startedAt);
    clearInterval(ui.examSim.timerId);
    ui.examSim.active = false;
    ui.examSim.finishedSummary = {
      perfect,
      total: filtered.length,
      propCorrect,
      propTotal,
      propPct: propTotal ? Math.round((propCorrect / propTotal) * 100) : 0,
      duration,
    };
    el.examSimBar.style.display = "none";
    el.btnExamSimLabel.textContent = "Mode Examen";
    el.btnExamSim.disabled = false;
    renderAll();
  }

  function exitExamSimIfNeeded() {
    if (!ui.examSim.active) return;
    clearInterval(ui.examSim.timerId);
    ui.examSim.active = false;
    ui.examSim.finishedSummary = null;
    el.examSimBar.style.display = "none";
    el.btnExamSimLabel.textContent = "Mode Examen";
    el.btnExamSim.disabled = false;
  }

  function formatDuration(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  // =========================================================
  // Official Grid Modal
  // =========================================================
  function openGridModal(examId, qNum) {
    const g = DATA.officialGrids && DATA.officialGrids[examId];
    if (!g) return;
    el.gridModalTitle.textContent = `Grille officielle — ${examId}${qNum ? ` (Question Q${qNum})` : ""}`;
    el.gridModalSub.textContent = `${g.header || ""} · Ophtalmologie : ${g.range || ""}`;
    if (g.notes) {
      el.gridModalNote.style.display = "block";
      el.gridModalNote.textContent = `Notes sur la grille : ${g.notes}`;
    } else {
      el.gridModalNote.style.display = "none";
    }
    el.gridModalImg.src = g.file;
    el.gridModal.classList.add("open");
    el.gridModal.setAttribute("aria-hidden", "false");
  }

  function closeGridModal() {
    el.gridModal.classList.remove("open");
    el.gridModal.setAttribute("aria-hidden", "true");
  }

  // =========================================================
  // Ophtalmologie V6 Course Reader Drawer
  // =========================================================
  function initCoursDrawer() {
    el.coursChapterSelect.innerHTML = "";
    COURS.forEach((ch, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = `${ch.index}. ${ch.title} (p. ${ch.startPage}–${ch.endPage})`;
      el.coursChapterSelect.appendChild(opt);
    });
    el.coursChapterSelect.addEventListener("change", () => renderCoursChapter(parseInt(el.coursChapterSelect.value, 10)));
    el.coursSearchInput.addEventListener("input", () => renderCoursChapter(parseInt(el.coursChapterSelect.value, 10)));
    if (COURS.length > 0) renderCoursChapter(0);
  }

  function openCoursDrawerAtPage(pageNum) {
    let targetIdx = 0;
    if (pageNum) {
      const found = COURS.findIndex((c) => pageNum >= c.startPage && pageNum <= c.endPage);
      if (found >= 0) targetIdx = found;
    }
    el.coursChapterSelect.value = String(targetIdx);
    el.coursSearchInput.value = "";
    renderCoursChapter(targetIdx, pageNum);
    el.coursDrawer.classList.add("open");
    el.coursDrawer.setAttribute("aria-hidden", "false");
  }

  function closeCoursDrawer() {
    el.coursDrawer.classList.remove("open");
    el.coursDrawer.setAttribute("aria-hidden", "true");
  }

  function renderCoursChapter(idx, scrollToPage) {
    const ch = COURS[idx];
    if (!ch) return;
    const query = el.coursSearchInput.value.trim();
    el.coursReaderBody.innerHTML = "";

    // Split chapter text by [Page N]
    const parts = (ch.text || "").split(/\[Page\s+(\d+)\]/);
    const frag = document.createDocumentFragment();
    let targetEl = null;

    if (query) {
      // Global search across ALL 17 chapters!
      const normQ = normalizeText(query);
      let hits = 0;
      for (const c of COURS) {
        const cParts = (c.text || "").split(/\[Page\s+(\d+)\]/);
        for (let i = 1; i + 1 < cParts.length; i += 2) {
          const pNum = parseInt(cParts[i], 10);
          const pTxt = cParts[i + 1].trim();
          if (normalizeText(pTxt).includes(normQ)) {
            hits++;
            const blk = document.createElement("div");
            blk.className = "cours-page-block";
            blk.innerHTML = `
              <div class="cours-page-badge">${escHtml(c.title)} · Page ${pNum}</div>
              <div class="cours-page-text">${highlightQuery(pTxt, query)}</div>
            `;
            frag.appendChild(blk);
          }
        }
      }
      if (hits === 0) {
        el.coursReaderBody.innerHTML = `<p style="color:var(--text-3)">Aucun passage trouvé dans Ophtalmologie V6 pour « ${escHtml(query)} ».</p>`;
      } else {
        el.coursReaderBody.appendChild(frag);
      }
      return;
    }

    for (let i = 1; i + 1 < parts.length; i += 2) {
      const pNum = parseInt(parts[i], 10);
      const pTxt = parts[i + 1].trim();
      const blk = document.createElement("div");
      blk.className = "cours-page-block";
      blk.innerHTML = `
        <div class="cours-page-badge">Ophtalmologie V6 · Page ${pNum}</div>
        <div class="cours-page-text">${escHtml(pTxt)}</div>
      `;
      if (scrollToPage && pNum === scrollToPage) targetEl = blk;
      frag.appendChild(blk);
    }

    el.coursReaderBody.appendChild(frag);
    if (targetEl) {
      setTimeout(() => targetEl.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } else {
      el.coursReaderBody.scrollTop = 0;
    }
  }

  function highlightQuery(text, query) {
    const safe = escHtml(text);
    const escQ = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp(`(${escQ})`, "gi"), "<mark>$1</mark>");
  }

  // =========================================================
  // Mobile Sidebar Helpers & Master Render
  // =========================================================
  function openMobileSidebar() {
    el.sidebar.classList.add("open");
    el.sidebarBackdrop.classList.add("open");
  }
  function closeMobileSidebar() {
    el.sidebar.classList.remove("open");
    el.sidebarBackdrop.classList.remove("open");
  }

  function renderAll() {
    const filtered = getFilteredQuestions();
    renderGlobalStats();
    renderSidebar();
    renderStageHeader(filtered);
    renderNavStrip(filtered);
    renderQuestions(filtered);
  }

  // =========================================================
  // Event Bindings & Init
  // =========================================================
  function init() {
    initTheme();
    initCoursDrawer();

    el.countCpc.textContent = (DATA.cpcQuestions || []).length;
    el.countTape.textContent = getAllQuestionsForMode("tape").length;

    // Default to Chapter 1 in CPC mode for crisp immediate experience
    if (DATA.cpcChapters && DATA.cpcChapters.length > 0) {
      ui.selectedKey = DATA.cpcChapters[0].num;
    }

    // Mode tabs
    [el.tabCpc, el.tabTape].forEach((tab) => {
      tab.addEventListener("click", () => {
        const nextMode = tab.dataset.mode;
        if (nextMode === ui.mode) return;
        exitExamSimIfNeeded();
        ui.mode = nextMode;
        ui.focusIndex = 0;
        ui._listLimit = 40;
        ui.selectedKey =
          nextMode === "cpc"
            ? (DATA.cpcChapters[0] ? DATA.cpcChapters[0].num : "ALL")
            : (DATA.tapeExams[0] ? DATA.tapeExams[0].examId : "ALL");
        el.tabCpc.classList.toggle("active", nextMode === "cpc");
        el.tabTape.classList.toggle("active", nextMode === "tape");
        el.tabCpc.setAttribute("aria-selected", String(nextMode === "cpc"));
        el.tabTape.setAttribute("aria-selected", String(nextMode === "tape"));
        renderAll();
      });
    });

    // Search
    el.searchInput.addEventListener("input", () => {
      ui.search = el.searchInput.value;
      ui.focusIndex = 0;
      ui._listLimit = 40;
      renderAll();
    });

    // Filter chips
    el.sidebarFilters.addEventListener("click", (e) => {
      const chip = e.target.closest(".filter-chip");
      if (!chip) return;
      ui.filter = chip.dataset.filter;
      ui.focusIndex = 0;
      ui._listLimit = 40;
      el.sidebarFilters.querySelectorAll(".filter-chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderAll();
    });

    // Select All
    el.btnSelectAll.addEventListener("click", () => {
      exitExamSimIfNeeded();
      ui.selectedKey = "ALL";
      ui.focusIndex = 0;
      ui._listLimit = 40;
      closeMobileSidebar();
      renderAll();
    });

    // View mode (Focus vs List)
    [el.btnViewFocus, el.btnViewList].forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.viewMode = btn.dataset.view;
        ui._listLimit = 40;
        el.btnViewFocus.classList.toggle("active", ui.viewMode === "focus");
        el.btnViewList.classList.toggle("active", ui.viewMode === "list");
        renderAll();
      });
    });

    // Focus pagination
    el.btnPrevQ.addEventListener("click", () => {
      if (ui.focusIndex > 0) {
        ui.focusIndex--;
        const f = getFilteredQuestions();
        renderNavStrip(f);
        renderQuestions(f);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
    el.btnNextQ.addEventListener("click", () => {
      const f = getFilteredQuestions();
      if (ui.focusIndex < f.length - 1) {
        ui.focusIndex++;
        renderNavStrip(f);
        renderQuestions(f);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    // Exam Simulation
    el.btnExamSim.addEventListener("click", startExamSim);
    el.btnFinishExam.addEventListener("click", finishExamSim);
    el.btnCancelExam.addEventListener("click", () => {
      exitExamSimIfNeeded();
      renderAll();
    });

    // Theme
    el.btnTheme.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(cur === "dark" ? "light" : "dark");
    });

    // Mobile sidebar
    el.btnSidebarToggle.addEventListener("click", openMobileSidebar);
    el.sidebarBackdrop.addEventListener("click", closeMobileSidebar);

    // Reset progress
    el.btnResetProgress.addEventListener("click", () => {
      if (confirm("Réinitialiser toutes vos réponses enregistrées et vos favoris ?")) {
        saved = { answers: {}, bookmarks: {} };
        ui.draftSelections = {};
        ui.openJustifs = {};
        saveState();
        renderAll();
      }
    });

    // Modal & Drawer close triggers
    document.querySelectorAll("[data-close-modal]").forEach((n) => n.addEventListener("click", closeGridModal));
    document.querySelectorAll("[data-close-drawer]").forEach((n) => n.addEventListener("click", closeCoursDrawer));
    el.btnOpenCours.addEventListener("click", () => openCoursDrawerAtPage(null));

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "Escape") {
        closeGridModal();
        closeCoursDrawer();
        closeMobileSidebar();
      } else if (ui.viewMode === "focus" && e.key === "ArrowRight") {
        el.btnNextQ.click();
      } else if (ui.viewMode === "focus" && e.key === "ArrowLeft") {
        el.btnPrevQ.click();
      }
    });

    renderAll();
  }

  init();
})();
