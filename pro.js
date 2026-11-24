/**
 * NEXUS Pro — Frontend Subscription System
 * localStorage-persisted · no real payment · fully self-contained
 */
(() => {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     HELPERS
  ═══════════════════════════════════════════════════════ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function esc(v) {
    return String(v).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  function showToast(msg, duration = 2800) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._proTimer);
    el._proTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  /* ═══════════════════════════════════════════════════════
     SUBSCRIPTION STATE
  ═══════════════════════════════════════════════════════ */
  const STORAGE_KEY = 'nexus-subscription';

  const DEFAULT_SUB = {
    plan:      'free',   // 'free' | 'pro'
    billing:   'monthly',
    activatedAt: null,
    expiresAt:   null,   // demo only — no real expiry enforced
  };

  function loadSub() {
    try {
      return Object.assign({}, DEFAULT_SUB, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch (_) { return { ...DEFAULT_SUB }; }
  }

  function saveSub(sub) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sub)); } catch (_) {}
  }

  let sub = loadSub();

  function isPro() { return sub.plan === 'pro'; }

  /* ═══════════════════════════════════════════════════════
     PRO FEATURE REGISTRY
     Define which capabilities are gated and their display info
  ═══════════════════════════════════════════════════════ */
  const PRO_FEATURES = {
    // Graphing
    multiGraph: {
      name: 'Multiple Simultaneous Graphs',
      desc: 'Plot up to 6 functions at once with the Pro plan.',
      panel: 'graphing',
    },
    graphAnalyze: {
      name: 'Advanced Graph Analysis',
      desc: 'Root detection, extrema analysis and intersection finding — Pro only.',
      panel: 'graphing',
    },
    // Solver
    solverSteps: {
      name: 'Step-by-Step Solutions',
      desc: 'See every algebraic step worked out clearly — available on Pro.',
      panel: 'solver',
    },
    cubicSolver: {
      name: 'Cubic Equation Solver',
      desc: 'Solve cubic and higher-degree polynomial equations with Pro.',
      panel: 'solver',
    },
    // Calculus
    calculusFull: {
      name: 'Advanced Calculus',
      desc: 'Definite integrals, Taylor series and limit analysis — Pro only.',
      panel: 'calculus',
    },
    // Matrix
    matrixAdvanced: {
      name: 'Advanced Matrix Operations',
      desc: 'Inverse, eigenvalues, rank and add/subtract/multiply — Pro only.',
      panel: 'matrix',
    },
    // Statistics
    statsAdvanced: {
      name: 'Advanced Statistics',
      desc: 'Full probability analysis, quartiles, skewness and more — Pro only.',
      panel: 'statistics',
    },
    // Physics
    physicsAdvanced: {
      name: 'Extended Physics Calculator',
      desc: 'All 12 physics formulas including Coulomb\'s Law, Ideal Gas and more — Pro only.',
      panel: 'physics',
    },
    // History
    unlimitedHistory: {
      name: 'Unlimited History',
      desc: 'Free plan limits history to 10 entries. Upgrade for unlimited storage.',
      panel: 'scientific',
    },
    // Export
    export: {
      name: 'PDF & CSV Export',
      desc: 'Export your calculations and results to PDF or CSV — Pro feature.',
      panel: null,
    },
    // Workspaces
    workspaces: {
      name: 'Multiple Workspaces',
      desc: 'Save and switch between separate calculation workspaces with Pro.',
      panel: null,
    },
  };

  /* ═══════════════════════════════════════════════════════
     FREE PLAN LIMITS
  ═══════════════════════════════════════════════════════ */
  const FREE_LIMITS = {
    maxHistory:    10,
    maxGraphEqs:   1,
    matOpsAllowed: ['det', 'transpose'],            // free matrix ops
    solverTypesAllowed: ['linear', 'quadratic'],   // free solver types
    calculusOpsAllowed: ['derivative', 'limit'],   // free calculus ops
    physicsCardsAllowed: 4,                         // first N cards shown free
  };

  /* ═══════════════════════════════════════════════════════
     UI STATE UPDATE — pro badge, sidebar banner, etc.
  ═══════════════════════════════════════════════════════ */
  function updateUIForPlan() {
    const badge = $('#proBadgeBtn');
    const badgeLabel = $('#proBadgeLabel');

    if (isPro()) {
      badge?.classList.remove('state-free');
      badge?.classList.add('state-pro');
      if (badgeLabel) badgeLabel.textContent = 'Pro ✓';
    } else {
      badge?.classList.remove('state-pro');
      badge?.classList.add('state-free');
      if (badgeLabel) badgeLabel.textContent = 'Upgrade';
    }

    updateSidebarBanner();
    applyPanelLocks();
    applyHistoryLimit();
    applyGraphLimit();
    applyMatrixLock();
    applySolverLock();
    applyCalculusLock();
    applyPhysicsLock();
  }

  /* ── Sidebar pro banner ── */
  function updateSidebarBanner() {
    const existing = $('#proSidebarBanner');
    const footer = $('.sidebar-footer');
    if (!footer) return;

    if (existing) existing.remove();

    if (isPro()) {
      const banner = document.createElement('div');
      banner.id = 'proSidebarBanner';
      banner.className = 'pro-sidebar-banner';
      banner.innerHTML = `
        <div class="psb-row1">
          <span class="psb-crown">★</span>
          <span>NEXUS Pro Active</span>
        </div>
        <div class="psb-row2">All features unlocked</div>`;
      banner.addEventListener('click', openStatusModal);
      footer.insertBefore(banner, footer.firstChild);
    } else {
      const banner = document.createElement('div');
      banner.id = 'proSidebarBanner';
      banner.className = 'pro-sidebar-banner';
      banner.innerHTML = `
        <div class="psb-row1">
          <span class="psb-crown">★</span>
          <span>Upgrade to Pro</span>
        </div>
        <div class="psb-row2">Unlock all features · ₦2,500/mo</div>`;
      banner.addEventListener('click', openPricingModal);
      footer.insertBefore(banner, footer.firstChild);
    }
  }

  /* ═══════════════════════════════════════════════════════
     HISTORY LIMIT
  ═══════════════════════════════════════════════════════ */
  function applyHistoryLimit() {
    const histList = $('#historyList');
    if (!histList) return;

    // Remove any existing limit banner
    const existing = $('#historyLimitBanner');
    if (existing) existing.remove();

    if (!isPro()) {
      // Inject limit banner into the drawer footer area
      const drawerFooter = $('.drawer-footer');
      if (drawerFooter && !$('#historyLimitBanner')) {
        const banner = document.createElement('div');
        banner.id = 'historyLimitBanner';
        banner.className = 'history-limit-banner';
        banner.innerHTML = `★ Free plan: last ${FREE_LIMITS.maxHistory} entries only. <strong>Upgrade for unlimited →</strong>`;
        banner.addEventListener('click', openPricingModal);
        drawerFooter.parentNode.insertBefore(banner, drawerFooter);
      }
    }
  }

  /* Intercept history additions — trim to free limit */
  function enforceHistoryLimit(historyArray) {
    if (isPro()) return historyArray;
    return historyArray.slice(0, FREE_LIMITS.maxHistory);
  }

  /* Monkey-patch localStorage history trimming */
  const _origSetItem = localStorage.setItem.bind(localStorage);
  const _storagePatch = (key, value) => {
    if (key === 'nexus-state' && !isPro()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed.history)) {
          parsed.history = parsed.history.slice(0, FREE_LIMITS.maxHistory);
          value = JSON.stringify(parsed);
        }
      } catch (_) {}
    }
    _origSetItem(key, value);
  };
  localStorage.setItem = _storagePatch;

  /* ═══════════════════════════════════════════════════════
     GRAPHING LIMIT
  ═══════════════════════════════════════════════════════ */
  function applyGraphLimit() {
    const addEqBtn = $('#addEqBtn');
    if (!addEqBtn) return;

    if (!isPro()) {
      // Intercept add equation button — allow only 1
      addEqBtn._proGated = true;
    } else {
      addEqBtn._proGated = false;
    }

    // Apply or remove CTA bar in graphing panel
    applyUpgradeCTABar('panel-graphing',
      'Free plan: 1 function graph max',
      'Multi-Graph (Pro)',
      'multiGraph');
  }

  /* ── addEqBtn intercept ── */
  document.addEventListener('click', e => {
    const btn = e.target.closest('#addEqBtn');
    if (!btn) return;
    if (isPro()) return; // let normal handler fire

    // Count current equations
    const eqRows = $$('.graph-eq-row');
    if (eqRows.length >= FREE_LIMITS.maxGraphEqs) {
      e.stopImmediatePropagation();
      e.preventDefault();
      showLockedModal('multiGraph');
    }
  }, true); // capture phase — fires before existing listener

  /* ═══════════════════════════════════════════════════════
     MATRIX LOCK
  ═══════════════════════════════════════════════════════ */
  function applyMatrixLock() {
    const matOp = $('#matOp');
    if (!matOp) return;
    if (isPro()) {
      // Remove any disabled options
      $$('option', matOp).forEach(opt => opt.removeAttribute('disabled'));
      $$('option', matOp).forEach(opt => {
        opt.textContent = opt.textContent.replace(' 🔒', '');
      });
      removeUpgradeCTABar('panel-matrix');
      return;
    }
    // Disable advanced ops for free users
    $$('option', matOp).forEach(opt => {
      const isLocked = !FREE_LIMITS.matOpsAllowed.includes(opt.value);
      if (isLocked) {
        opt.setAttribute('disabled', 'true');
        if (!opt.textContent.includes('🔒')) opt.textContent += ' 🔒';
      }
    });
    applyUpgradeCTABar('panel-matrix',
      'Advanced matrix ops (inverse, multiply, eigenvalues) are Pro only',
      'Unlock Matrix (Pro)',
      'matrixAdvanced');
  }

  /* Intercept matrix compute for locked ops */
  document.addEventListener('click', e => {
    const btn = e.target.closest('#runMatBtn');
    if (!btn || isPro()) return;
    const op = $('#matOp')?.value;
    if (op && !FREE_LIMITS.matOpsAllowed.includes(op)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      showLockedModal('matrixAdvanced');
    }
  }, true);

  /* ═══════════════════════════════════════════════════════
     SOLVER LOCK
  ═══════════════════════════════════════════════════════ */
  function applySolverLock() {
    const solverType = $('#solverType');
    if (!solverType) return;
    if (isPro()) {
      $$('option', solverType).forEach(opt => {
        opt.removeAttribute('disabled');
        opt.textContent = opt.textContent.replace(' 🔒', '');
      });
      removeUpgradeCTABar('panel-solver');
      // Remove step-by-step lock badge
      const existing = $('#solverStepLockBadge');
      if (existing) existing.remove();
      return;
    }
    // Lock polynomial, simultaneous, cubic
    $$('option', solverType).forEach(opt => {
      const isLocked = !FREE_LIMITS.solverTypesAllowed.includes(opt.value);
      if (isLocked) {
        opt.setAttribute('disabled', 'true');
        if (!opt.textContent.includes('🔒')) opt.textContent += ' 🔒';
      }
    });
    // Inject step-by-step lock badge next to solve button
    const solveBtn = $('#solveBtn');
    if (solveBtn && !$('#solverStepLockBadge')) {
      const badge = document.createElement('span');
      badge.id = 'solverStepLockBadge';
      badge.className = 'pro-lock-badge';
      badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Steps = Pro`;
      badge.addEventListener('click', () => showLockedModal('solverSteps'));
      solveBtn.parentNode.insertBefore(badge, solveBtn.nextSibling);
    }
    applyUpgradeCTABar('panel-solver',
      'Cubic, polynomial & simultaneous solvers are Pro only',
      'Unlock Solver (Pro)',
      'cubicSolver');
  }

  /* Intercept solver for locked types */
  document.addEventListener('click', e => {
    const btn = e.target.closest('#solveBtn');
    if (!btn || isPro()) return;
    const type = $('#solverType')?.value;
    if (type && !FREE_LIMITS.solverTypesAllowed.includes(type)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      showLockedModal('cubicSolver');
    }
  }, true);

  /* ═══════════════════════════════════════════════════════
     CALCULUS LOCK
  ═══════════════════════════════════════════════════════ */
  function applyCalculusLock() {
    const calcOp = $('#calculusOp');
    if (!calcOp) return;
    if (isPro()) {
      $$('option', calcOp).forEach(opt => {
        opt.removeAttribute('disabled');
        opt.textContent = opt.textContent.replace(' 🔒', '');
      });
      removeUpgradeCTABar('panel-calculus');
      return;
    }
    $$('option', calcOp).forEach(opt => {
      const isLocked = !FREE_LIMITS.calculusOpsAllowed.includes(opt.value);
      if (isLocked) {
        opt.setAttribute('disabled', 'true');
        if (!opt.textContent.includes('🔒')) opt.textContent += ' 🔒';
      }
    });
    applyUpgradeCTABar('panel-calculus',
      'Definite integrals & Taylor series are Pro only',
      'Unlock Calculus (Pro)',
      'calculusFull');
  }

  /* Intercept calculus for locked ops */
  document.addEventListener('click', e => {
    const btn = e.target.closest('#runCalculusBtn');
    if (!btn || isPro()) return;
    const op = $('#calculusOp')?.value;
    if (op && !FREE_LIMITS.calculusOpsAllowed.includes(op)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      showLockedModal('calculusFull');
    }
  }, true);

  /* ═══════════════════════════════════════════════════════
     PHYSICS LOCK — show only first N cards on free
  ═══════════════════════════════════════════════════════ */
  function applyPhysicsLock() {
    const grid = $('#physicsFormulaGrid');
    if (!grid) return;
    const cards = $$('.physics-card', grid);
    if (isPro()) {
      cards.forEach(c => {
        c.style.display = '';
        const lock = c.querySelector('.pro-panel-lock');
        if (lock) lock.remove();
      });
      removeUpgradeCTABar('panel-physics');
      return;
    }
    cards.forEach((card, i) => {
      if (i < FREE_LIMITS.physicsCardsAllowed) {
        card.style.display = '';
        const lock = card.querySelector('.pro-panel-lock');
        if (lock) lock.remove();
      } else {
        // Add lock overlay if not already there
        if (!card.querySelector('.pro-panel-lock')) {
          card.style.position = 'relative';
          const overlay = document.createElement('div');
          overlay.className = 'pro-panel-lock';
          overlay.innerHTML = `
            <div class="ppl-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="url(#lockO${i})" stroke-width="1.8">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
                <defs><linearGradient id="lockO${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#f97316"/></linearGradient></defs>
              </svg>
            </div>
            <div class="ppl-title">Pro Feature</div>
            <div class="ppl-desc">Upgrade to unlock all 12 physics formulas</div>
            <button class="ppl-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M2 20h20M5 20L3 8l5 4 4-7 4 7 5-4-2 12H5z"/></svg>
              Upgrade to Pro
            </button>`;
          overlay.querySelector('.ppl-btn')?.addEventListener('click', () => showLockedModal('physicsAdvanced'));
          card.appendChild(overlay);
        }
      }
    });
    applyUpgradeCTABar('panel-physics',
      `${cards.length - FREE_LIMITS.physicsCardsAllowed} more formulas available on Pro`,
      'Unlock Physics (Pro)',
      'physicsAdvanced');
  }

  /* ═══════════════════════════════════════════════════════
     UPGRADE CTA BAR helpers
  ═══════════════════════════════════════════════════════ */
  function applyUpgradeCTABar(panelId, text, btnText, featureKey) {
    if (isPro()) { removeUpgradeCTABar(panelId); return; }
    const panel = $(`#panel-${panelId}`);
    if (!panel) return;
    const existing = panel.querySelector('.upgrade-cta-bar');
    if (existing) return; // already added
    const bar = document.createElement('div');
    bar.className = 'upgrade-cta-bar';
    bar.innerHTML = `
      <div class="upgrade-cta-bar-text">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="url(#ctaGrad${panelId})" stroke-width="1.8">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
          <defs><linearGradient id="ctaGrad${panelId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#f97316"/></linearGradient></defs>
        </svg>
        <span><strong>Free plan:</strong> ${esc(text)}</span>
      </div>
      <button class="upgrade-cta-bar-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M2 20h20M5 20L3 8l5 4 4-7 4 7 5-4-2 12H5z"/></svg>
        ${esc(btnText)}
      </button>`;
    bar.querySelector('.upgrade-cta-bar-btn')?.addEventListener('click', () => showLockedModal(featureKey));
    panel.insertBefore(bar, panel.firstChild);
  }

  function removeUpgradeCTABar(panelId) {
    const panel = $(`#panel-${panelId}`);
    panel?.querySelector('.upgrade-cta-bar')?.remove();
  }

  /* ═══════════════════════════════════════════════════════
     PANEL LOCKS  (not used for full-panel blocks currently,
     but available as a utility for future use)
  ═══════════════════════════════════════════════════════ */
  function applyPanelLocks() {
    // For statistics panel — lock advanced features
    const statsPanel = $('#panel-statistics');
    if (statsPanel) {
      if (!isPro()) {
        applyUpgradeCTABar('statistics',
          'Full probability distributions & advanced analysis are Pro only',
          'Unlock Stats (Pro)',
          'statsAdvanced');
      } else {
        removeUpgradeCTABar('statistics');
      }
    }
  }

  /* ═══════════════════════════════════════════════════════
     PRICING MODAL
  ═══════════════════════════════════════════════════════ */
  let billingYearly = false;

  function openPricingModal() {
    const modal = $('#pricingModal');
    if (!modal) return;
    modal.style.display = 'flex';
    updatePricingCards();
    updateBillingUI();
    // Reset to current plan button states
    updateFreePlanBtn();
  }

  function closePricingModal() {
    const modal = $('#pricingModal');
    if (modal) modal.style.display = 'none';
  }

  function updatePricingCards() {
    const amount = $('#proPriceAmount');
    const period = $('#proPricePeriod');
    const yearlyNote = $('#priceYearlyNote');

    if (billingYearly) {
      if (amount) amount.textContent = '20,000';
      if (period) period.textContent = '/ year';
      if (yearlyNote) yearlyNote.style.display = 'block';
    } else {
      if (amount) amount.textContent = '2,500';
      if (period) period.textContent = '/ month';
      if (yearlyNote) yearlyNote.style.display = 'none';
    }
  }

  function updateBillingUI() {
    const toggle = $('#billingToggle');
    if (toggle) toggle.checked = billingYearly;
    const monthlyLabel = $('#billLabelMonthly');
    const yearlyLabel  = $('#billLabelYearly');
    if (monthlyLabel) monthlyLabel.classList.toggle('active', !billingYearly);
    if (yearlyLabel)  yearlyLabel.classList.toggle('active',  billingYearly);
    const savePill = $('#billingSavePill');
    if (savePill) savePill.style.opacity = billingYearly ? '1' : '0.4';
  }

  function updateFreePlanBtn() {
    const freeBtn = $('#freePlanBtn');
    const proBtn  = $('#proPlanBtn');
    if (!freeBtn || !proBtn) return;
    if (isPro()) {
      freeBtn.textContent = 'Downgrade to Free';
      freeBtn.disabled = false;
      proBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2 20h20M5 20L3 8l5 4 4-7 4 7 5-4-2 12H5z"/></svg>
        Pro Active ✓`;
      proBtn.disabled = true;
    } else {
      freeBtn.textContent = 'Current Plan';
      freeBtn.disabled = true;
      proBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2 20h20M5 20L3 8l5 4 4-7 4 7 5-4-2 12H5z"/></svg>
        Activate Pro — Demo`;
      proBtn.disabled = false;
    }
  }

  function toggleFeatureTable() {
    const table = $('#featureTable');
    const icon  = $('#ftToggleIcon');
    if (!table) return;
    const isOpen = table.style.display !== 'none';
    table.style.display = isOpen ? 'none' : 'block';
    icon?.classList.toggle('open', !isOpen);
  }

  /* ── Wire pricing modal ── */
  $('#pricingModalClose')?.addEventListener('click', closePricingModal);
  $('#pricingModal')?.addEventListener('click', e => {
    if (e.target === $('#pricingModal')) closePricingModal();
  });
  $('#billingToggle')?.addEventListener('change', e => {
    billingYearly = e.target.checked;
    updatePricingCards();
    updateBillingUI();
  });
  $('#featureTableToggle')?.addEventListener('click', toggleFeatureTable);

  /* ── Free plan button (downgrade) ── */
  $('#freePlanBtn')?.addEventListener('click', () => {
    if (!isPro()) return; // already free
    if (!confirm('Downgrade to Free? This is a demo — no real payment is affected.')) return;
    activatePlan('free', 'monthly');
    closePricingModal();
    showToast('Downgraded to Free plan');
  });

  /* ── Pro plan button (upgrade) ── */
  $('#proPlanBtn')?.addEventListener('click', () => {
    if (isPro()) return;
    closePricingModal();
    showUpgradeSuccess();
  });

  /* ── Pro badge button ── */
  $('#proBadgeBtn')?.addEventListener('click', () => {
    if (isPro()) openStatusModal();
    else openPricingModal();
  });

  /* ═══════════════════════════════════════════════════════
     UPGRADE FLOW — simulated activation
  ═══════════════════════════════════════════════════════ */
  function showUpgradeSuccess() {
    const billing = billingYearly ? 'yearly' : 'monthly';

    // Show a "processing" toast
    showToast('⚡ Activating NEXUS Pro…', 1600);

    setTimeout(() => {
      activatePlan('pro', billing);
      openStatusModal(true); // true = fresh activation
    }, 1200);
  }

  function activatePlan(plan, billing) {
    sub = {
      plan,
      billing,
      activatedAt: plan === 'pro' ? new Date().toISOString() : null,
      expiresAt:   plan === 'pro' ? getExpiryDate(billing) : null,
    };
    saveSub(sub);
    updateUIForPlan();
  }

  function getExpiryDate(billing) {
    const d = new Date();
    if (billing === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d.toISOString();
  }

  /* ═══════════════════════════════════════════════════════
     STATUS MODAL
  ═══════════════════════════════════════════════════════ */
  function openStatusModal(fresh = false) {
    const modal   = $('#proStatusModal');
    const content = $('#proStatusContent');
    if (!modal || !content) return;

    if (isPro()) {
      const activatedStr = sub.activatedAt
        ? new Date(sub.activatedAt).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
        : 'Demo';
      const expiresStr = sub.expiresAt
        ? new Date(sub.expiresAt).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
        : '—';
      const price = sub.billing === 'yearly' ? '₦20,000/year' : '₦2,500/month';

      content.innerHTML = `
        <div class="status-active-header">
          <div class="status-crown-ring ${fresh ? 'pro-success-anim' : ''}">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="url(#statusCrown)">
              <path d="M2 20h20M5 20L3 8l5 4 4-7 4 7 5-4-2 12H5z"/>
              <defs><linearGradient id="statusCrown" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#f97316"/></linearGradient></defs>
            </svg>
          </div>
          <div class="status-title">${fresh ? '🎉 Welcome to Pro!' : 'NEXUS Pro Active'}</div>
          <div class="status-subtitle">${fresh ? 'You now have access to all features.' : 'Your subscription is active.'}</div>
        </div>
        <div class="status-info-grid">
          <div class="status-info-cell">
            <div class="sic-label">Plan</div>
            <div class="sic-value highlight">NEXUS Pro</div>
          </div>
          <div class="status-info-cell">
            <div class="sic-label">Billing</div>
            <div class="sic-value">${sub.billing === 'yearly' ? 'Yearly' : 'Monthly'}</div>
          </div>
          <div class="status-info-cell">
            <div class="sic-label">Activated</div>
            <div class="sic-value">${activatedStr}</div>
          </div>
          <div class="status-info-cell">
            <div class="sic-label">Next renewal</div>
            <div class="sic-value">${expiresStr}</div>
          </div>
          <div class="status-info-cell" style="grid-column:1/-1">
            <div class="sic-label">Price (Demo)</div>
            <div class="sic-value">${esc(price)}</div>
          </div>
        </div>
        <div class="status-actions">
          <button class="status-close-btn" id="statusOkBtn">Done</button>
          <button class="status-downgrade-btn" id="statusDowngradeBtn">Cancel subscription (demo)</button>
        </div>
        <p style="text-align:center;font-size:10.5px;color:var(--text-3);margin-top:12px;">
          ⓘ This is a frontend demo. No real payment has been made.
        </p>`;

      $('#statusOkBtn')?.addEventListener('click', closeStatusModal);
      $('#statusDowngradeBtn')?.addEventListener('click', () => {
        if (!confirm('Downgrade to Free? (Demo only — no real cancellation)')) return;
        activatePlan('free', 'monthly');
        closeStatusModal();
        showToast('Subscription cancelled — back on Free plan');
      });
    } else {
      content.innerHTML = `
        <div class="status-active-header">
          <div style="font-size:48px;margin-bottom:12px;">📊</div>
          <div class="status-title" style="font-size:20px;color:var(--text);">Free Plan</div>
          <div class="status-subtitle">Upgrade to unlock all features.</div>
        </div>
        <div class="status-actions" style="margin-top:20px">
          <button class="plan-btn plan-btn-pro" id="statusUpgradeBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2 20h20M5 20L3 8l5 4 4-7 4 7 5-4-2 12H5z"/></svg>
            Upgrade to Pro
          </button>
          <button class="status-close-btn" id="statusOkBtn2" style="margin-top:4px">Close</button>
        </div>`;
      $('#statusUpgradeBtn')?.addEventListener('click', () => { closeStatusModal(); openPricingModal(); });
      $('#statusOkBtn2')?.addEventListener('click', closeStatusModal);
    }

    modal.style.display = 'flex';
  }

  function closeStatusModal() {
    const modal = $('#proStatusModal');
    if (modal) modal.style.display = 'none';
  }

  $('#proStatusClose')?.addEventListener('click', closeStatusModal);
  $('#proStatusModal')?.addEventListener('click', e => {
    if (e.target === $('#proStatusModal')) closeStatusModal();
  });

  /* ═══════════════════════════════════════════════════════
     LOCKED FEATURE MODAL
  ═══════════════════════════════════════════════════════ */
  function showLockedModal(featureKey) {
    const feature = PRO_FEATURES[featureKey];
    if (!feature) { openPricingModal(); return; }

    const modal = $('#lockedModal');
    const nameEl = $('#lockedFeatureName');
    const descEl = $('#lockedFeatureDesc');
    if (!modal || !nameEl || !descEl) return;

    nameEl.textContent = feature.name;
    descEl.textContent = feature.desc;
    modal.style.display = 'flex';
  }

  function closeLockedModal() {
    const modal = $('#lockedModal');
    if (modal) modal.style.display = 'none';
  }

  $('#lockedModalClose')?.addEventListener('click', closeLockedModal);
  $('#lockedDismissBtn')?.addEventListener('click', closeLockedModal);
  $('#lockedModal')?.addEventListener('click', e => {
    if (e.target === $('#lockedModal')) closeLockedModal();
  });
  $('#lockedUpgradeBtn')?.addEventListener('click', () => {
    closeLockedModal();
    openPricingModal();
  });

  /* ═══════════════════════════════════════════════════════
     KEYBOARD — Escape closes all pro modals
  ═══════════════════════════════════════════════════════ */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closePricingModal();
      closeStatusModal();
      closeLockedModal();
    }
  });

  /* ═══════════════════════════════════════════════════════
     EXPORT — intercept export button in history drawer
  ═══════════════════════════════════════════════════════ */
  document.addEventListener('click', e => {
    const btn = e.target.closest('#exportHistoryBtn');
    if (!btn) return;
    if (isPro()) return; // let normal handler fire (CSV export from script.js)
    e.stopImmediatePropagation();
    e.preventDefault();
    showLockedModal('export');
  }, true);

  /* ═══════════════════════════════════════════════════════
     OBSERVE PHYSICS GRID — apply lock when cards render
  ═══════════════════════════════════════════════════════ */
  const physicsGrid = $('#physicsFormulaGrid');
  if (physicsGrid) {
    const obs = new MutationObserver(() => {
      if (!isPro()) applyPhysicsLock();
    });
    obs.observe(physicsGrid, { childList: true });
  }

  /* ═══════════════════════════════════════════════════════
     OBSERVE SOLVER STEPS — lock step-by-step display on free
  ═══════════════════════════════════════════════════════ */
  const solverStepsEl = $('#solverSteps');
  if (solverStepsEl) {
    const obs = new MutationObserver(() => {
      if (!isPro() && solverStepsEl.style.display !== 'none') {
        // Overlay the step-by-step result with a lock
        const existing = solverStepsEl.querySelector('.pro-panel-lock');
        if (!existing) {
          solverStepsEl.style.position = 'relative';
          const lock = document.createElement('div');
          lock.className = 'pro-panel-lock';
          lock.innerHTML = `
            <div class="ppl-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </div>
            <div class="ppl-title">Step-by-step = Pro</div>
            <div class="ppl-desc">Upgrade to see every solution step worked out.</div>
            <button class="ppl-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M2 20h20M5 20L3 8l5 4 4-7 4 7 5-4-2 12H5z"/></svg>
              Upgrade to Pro
            </button>`;
          lock.querySelector('.ppl-btn')?.addEventListener('click', () => showLockedModal('solverSteps'));
          solverStepsEl.appendChild(lock);
        }
      }
      if (isPro()) {
        solverStepsEl.querySelector('.pro-panel-lock')?.remove();
      }
    });
    obs.observe(solverStepsEl, { attributes: true, attributeFilter: ['style'] });
  }

  /* ═══════════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════════ */
  function init() {
    // Apply initial badge state
    const badge = $('#proBadgeBtn');
    if (badge) {
      badge.classList.add(isPro() ? 'state-pro' : 'state-free');
    }

    // Build initial UI
    updateUIForPlan();

    // Log
    console.log(
      `%cNEXUS Pro system ready · plan: ${sub.plan}`,
      'color:#a78bfa;font-weight:bold'
    );
  }

  // Wait for script.js to finish rendering physics cards etc.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // script.js runs synchronously, so physics cards exist by now
    setTimeout(init, 100);
  }

})();
