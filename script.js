/**
 * NEXUS Scientific Calculator
 * Complete modular implementation — no eval(), no frameworks, no backend.
 */
(() => {
  'use strict';

  /* ═══════════════════════════════════════════
     UTILITIES
  ═══════════════════════════════════════════ */
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  function esc(v) {
    return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function showToast(msg, duration = 2500) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), duration);
  }

  function addRipple(btn, e) {
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const r = document.createElement('span');
    r.className = 'ripple';
    r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
    btn.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  }

  /* ═══════════════════════════════════════════
     APP STATE
  ═══════════════════════════════════════════ */
  const state = {
    // Calculator
    expression: '',
    answer: 0,
    justCalc: false,
    angle: 'DEG',      // 'DEG' | 'RAD'
    memory: 0,
    precision: 10,
    sciNotation: true,
    // History
    history: [],
    // Variables
    variables: {},
    // Theme
    theme: 'dark',
    // Graph
    equations: ['sin(x)', 'cos(x)'],
    graphScale: 50,
    graphOffX: 0,
    graphOffY: 0,
  };

  // Load persisted state
  try {
    const saved = JSON.parse(localStorage.getItem('nexus-state') || '{}');
    if (saved.angle) state.angle = saved.angle;
    if (typeof saved.precision === 'number') state.precision = saved.precision;
    if (typeof saved.sciNotation === 'boolean') state.sciNotation = saved.sciNotation;
    if (saved.theme) state.theme = saved.theme;
    if (Array.isArray(saved.history)) state.history = saved.history.slice(0, 300);
    if (saved.variables && typeof saved.variables === 'object') state.variables = saved.variables;
  } catch (_) {}

  function saveState() {
    try {
      localStorage.setItem('nexus-state', JSON.stringify({
        angle: state.angle,
        precision: state.precision,
        sciNotation: state.sciNotation,
        theme: state.theme,
        history: state.history.slice(0, 300),
        variables: state.variables,
      }));
    } catch (_) {}
  }

  /* ═══════════════════════════════════════════
     MATH PARSER  (recursive-descent, no eval)
  ═══════════════════════════════════════════ */
  class MathParser {
    constructor(src, vars = {}) {
      // Normalise operators
      this.src = src
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-')
        .replace(/π/g, 'pi')
        .replace(/\bAns\b/g, '__ans')
        .replace(/([0-9)\.])\s*(pi|e\b|__ans|[a-zA-Z_])/g, '$1*$2');
      this.pos = 0;
      this.vars = vars;
    }

    peek() { return this.src[this.pos] || ''; }

    ws() { while (/\s/.test(this.peek())) this.pos++; }

    consume(pat) {
      this.ws();
      const m = this.src.slice(this.pos).match(pat);
      if (!m) return null;
      this.pos += m[0].length;
      return m[0];
    }

    parse() {
      const v = this.expr();
      this.ws();
      if (this.pos < this.src.length)
        throw new Error(`Unexpected token at position ${this.pos + 1}: "${this.src[this.pos]}"`);
      return v;
    }

    expr() {
      let v = this.term();
      for (;;) {
        this.ws();
        if (this.peek() === '+') { this.pos++; v += this.term(); }
        else if (this.peek() === '-') { this.pos++; v -= this.term(); }
        else break;
      }
      return v;
    }

    term() {
      let v = this.unary();
      for (;;) {
        this.ws();
        if (this.peek() === '*') { this.pos++; v *= this.unary(); }
        else if (this.peek() === '/') {
          this.pos++;
          const d = this.unary();
          if (d === 0) throw new Error('Division by zero');
          v /= d;
        } else if (this.src.startsWith('mod', this.pos)) {
          this.pos += 3;
          const m = this.unary();
          if (m === 0) throw new Error('Modulo by zero');
          v = ((v % m) + m) % m;
        } else break;
      }
      return v;
    }

    unary() {
      this.ws();
      if (this.peek() === '+') { this.pos++; return +this.unary(); }
      if (this.peek() === '-') { this.pos++; return -this.unary(); }
      return this.power();
    }

    power() {
      let v = this.primary();
      this.ws();
      if (this.peek() === '^') {
        this.pos++;
        v = Math.pow(v, this.unary());
      }
      return v;
    }

    primary() {
      this.ws();

      // Parentheses
      if (this.peek() === '(') {
        this.pos++;
        const v = this.expr();
        this.ws();
        if (this.peek() !== ')') throw new Error('Missing closing parenthesis');
        this.pos++;
        return v;
      }

      // Number literal
      const num = this.consume(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?/);
      if (num !== null) return Number(num);

      // Named token (function or constant or variable)
      const name = this.consume(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (name === null) throw new Error('Unexpected character: ' + (this.peek() || 'end of input'));

      // Constants
      if (name === 'pi' || name === 'PI') return Math.PI;
      if (name === 'e') return Math.E;
      if (name === '__ans') return state.answer;
      if (name === 'inf' || name === 'Inf') return Infinity;

      // User variables
      if (Object.prototype.hasOwnProperty.call(this.vars, name)) return this.vars[name];
      if (Object.prototype.hasOwnProperty.call(state.variables, name)) return state.variables[name];

      // Functions — collect args
      const args = this._args();

      // Trig
      const toRad = x => state.angle === 'DEG' ? x * Math.PI / 180 : x;
      const fromRad = x => state.angle === 'DEG' ? x * 180 / Math.PI : x;

      switch (name) {
        case 'sin':  return Math.sin(toRad(args[0]));
        case 'cos':  return Math.cos(toRad(args[0]));
        case 'tan':  {
          const t = Math.tan(toRad(args[0]));
          if (!isFinite(t)) throw new Error('tan undefined at this angle');
          return t;
        }
        case 'asin': { const r = Math.asin(args[0]); if (isNaN(r)) throw new Error('Domain error: asin'); return fromRad(r); }
        case 'acos': { const r = Math.acos(args[0]); if (isNaN(r)) throw new Error('Domain error: acos'); return fromRad(r); }
        case 'atan': return fromRad(Math.atan(args[0]));
        case 'atan2': return fromRad(Math.atan2(args[0], args[1]));
        case 'sinh':  return Math.sinh(args[0]);
        case 'cosh':  return Math.cosh(args[0]);
        case 'tanh':  return Math.tanh(args[0]);
        case 'asinh': return Math.asinh(args[0]);
        case 'acosh': { const r = Math.acosh(args[0]); if (isNaN(r)) throw new Error('Domain error: acosh'); return r; }
        case 'atanh': { const r = Math.atanh(args[0]); if (!isFinite(r)) throw new Error('Domain error: atanh'); return r; }
        // Roots & powers
        case 'sqrt': { if (args[0] < 0) throw new Error('sqrt of negative number'); return Math.sqrt(args[0]); }
        case 'cbrt': return Math.cbrt(args[0]);
        case 'nthroot': { if (args[1] === 0) throw new Error('Root index cannot be zero'); return Math.sign(args[0]) * Math.pow(Math.abs(args[0]), 1/args[1]); }
        case 'pow':  return Math.pow(args[0], args[1]);
        case 'exp':  return Math.exp(args[0]);
        // Logs
        case 'log':  case 'log10': { if (args[0] <= 0) throw new Error('log domain error'); return Math.log10(args[0]); }
        case 'ln':   { if (args[0] <= 0) throw new Error('ln domain error'); return Math.log(args[0]); }
        case 'log2': { if (args[0] <= 0) throw new Error('log2 domain error'); return Math.log2(args[0]); }
        case 'logn': { if (args[0] <= 0 || args[1] <= 0 || args[1] === 1) throw new Error('logn domain error'); return Math.log(args[0])/Math.log(args[1]); }
        // Rounding
        case 'abs':   return Math.abs(args[0]);
        case 'floor': return Math.floor(args[0]);
        case 'ceil':  return Math.ceil(args[0]);
        case 'round': return Math.round(args[0]);
        case 'trunc': return Math.trunc(args[0]);
        case 'sign':  return Math.sign(args[0]);
        // Combinatorics
        case 'factorial': case 'fact': return factorial(args[0]);
        case 'npr':  return nPr(args[0], args[1]);
        case 'ncr':  return nCr(args[0], args[1]);
        // Misc
        case 'min':  return Math.min(...args);
        case 'max':  return Math.max(...args);
        case 'gcd':  return gcd(Math.round(args[0]), Math.round(args[1]));
        case 'lcm':  return Math.abs(Math.round(args[0]) * Math.round(args[1])) / gcd(Math.round(args[0]), Math.round(args[1]));
        case 'mod':  { if (args[1] === 0) throw new Error('Modulo by zero'); return ((args[0] % args[1]) + args[1]) % args[1]; }
        case 'hypot': return Math.hypot(...args);
        case 'clamp': return Math.min(Math.max(args[0], args[1]), args[2]);
        case 'random': return Math.random();
        default: throw new Error(`Unknown function: ${name}`);
      }
    }

    _args() {
      this.ws();
      if (this.peek() !== '(') {
        // single implicit argument (no parens)
        return [this.power()];
      }
      this.pos++;
      const args = [];
      this.ws();
      if (this.peek() !== ')') {
        do {
          args.push(this.expr());
          this.ws();
          if (this.peek() === ',') { this.pos++; continue; }
          break;
        } while (true);
      }
      if (this.peek() !== ')') throw new Error('Missing closing parenthesis in function call');
      this.pos++;
      return args;
    }
  }

  function evaluate(expr, vars = {}) {
    return new MathParser(expr, vars).parse();
  }

  /* ── Math helpers ── */
  function factorial(n) {
    n = Math.round(n);
    if (n < 0 || n > 170) throw new Error('Factorial requires 0 ≤ n ≤ 170');
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  function nPr(n, r) {
    n = Math.round(n); r = Math.round(r);
    if (r < 0 || r > n) throw new Error('Invalid nPr: need 0 ≤ r ≤ n');
    return factorial(n) / factorial(n - r);
  }

  function nCr(n, r) {
    n = Math.round(n); r = Math.round(r);
    if (r < 0 || r > n) throw new Error('Invalid nCr: need 0 ≤ r ≤ n');
    return factorial(n) / (factorial(r) * factorial(n - r));
  }

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { [a, b] = [b, a % b]; }
    return a;
  }

  /* ── Number formatting ── */
  function fmt(v, prec) {
    if (!isFinite(v)) return isNaN(v) ? 'NaN' : (v > 0 ? '∞' : '-∞');
    if (Object.is(v, -0)) v = 0;
    const p = prec ?? state.precision;
    const abs = Math.abs(v);
    if (state.sciNotation && abs !== 0 && (abs >= 1e12 || abs < 1e-9)) {
      return v.toExponential(Math.min(p - 1, 6)).replace(/\.?0+e/, 'e').replace('e+', 'e');
    }
    const s = parseFloat(v.toPrecision(p));
    // avoid -0
    return Object.is(s, -0) ? '0' : String(s);
  }

  /* ═══════════════════════════════════════════
     PANEL NAVIGATION
  ═══════════════════════════════════════════ */
  const panelLabels = {
    scientific: 'Scientific Calculator',
    graphing:   'Graphing Calculator',
    solver:     'Equation Solver',
    calculus:   'Calculus Studio',
    statistics: 'Statistics & Probability',
    matrix:     'Matrix Calculator',
    converter:  'Unit Converter',
    physics:    'Physics Calculator',
  };

  function switchPanel(id) {
    // Desktop sidebar
    $$('.nav-btn[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === id));
    // All panels
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${id}`));
    // Topbar label
    const label = $('#moduleSelectorLabel');
    if (label) label.textContent = panelLabels[id] || id;
    // Mobile tab bar
    $$('.mobile-tab-btn[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === id));
    // Mobile bottom nav active state (home = scientific, tools = everything else)
    $$('.mobile-nav-item[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === id));
    if (id === 'scientific') {
      $('#mobileNavHome')?.classList.add('active');
    } else {
      $('#mobileNavHome')?.classList.remove('active');
    }
    // Redraw canvases
    if (id === 'graphing') setTimeout(drawGraph, 80);
    if (id === 'statistics') setTimeout(drawStatsChart, 80);
    closeSidebar();
    // Scroll to top of panel on mobile
    if (window.innerWidth <= 680) {
      const panel = $(`#panel-${id}`);
      if (panel) panel.scrollTop = 0;
    }
  }

  $$('.nav-btn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  });

  /* ═══════════════════════════════════════════
     THEME
  ═══════════════════════════════════════════ */
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    $('#darkThemeBtn')?.classList.toggle('active', theme === 'dark');
    $('#lightThemeBtn')?.classList.toggle('active', theme === 'light');
    $('#settingDarkTheme')?.classList.toggle('active', theme === 'dark');
    $('#settingLightTheme')?.classList.toggle('active', theme === 'light');
    saveState();
    setTimeout(drawGraph, 50);
    setTimeout(drawStatsChart, 50);
  }

  $('#darkThemeBtn')?.addEventListener('click', () => applyTheme('dark'));
  $('#lightThemeBtn')?.addEventListener('click', () => applyTheme('light'));
  applyTheme(state.theme);

  /* ═══════════════════════════════════════════
     SIDEBAR MOBILE
  ═══════════════════════════════════════════ */
  function openSidebar()  { $('#sidebar')?.classList.add('open'); }
  function closeSidebar() { $('#sidebar')?.classList.remove('open'); }
  $('#mobileMenuBtn')?.addEventListener('click', openSidebar);

  /* ═══════════════════════════════════════════
     FULLSCREEN
  ═══════════════════════════════════════════ */
  $('#fullscreenBtn')?.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  /* ═══════════════════════════════════════════
     SCIENTIFIC CALCULATOR
  ═══════════════════════════════════════════ */
  const dispResult = $('#displayResult');
  const dispExpr   = $('#displayExpression');
  const dispSec    = $('#displaySecondary');
  const memInd     = $('#memIndicator');

  function updateDisplay() {
    dispResult.textContent = state.expression || '0';
    const isErr = state.expression === 'Error' || state.expression.startsWith('Error:');
    dispResult.classList.toggle('error', isErr);
    memInd.textContent = state.memory !== 0 ? `M: ${fmt(state.memory)}` : 'M';
    memInd.classList.toggle('active', state.memory !== 0);
  }

  function calcAppend(val) {
    if (state.justCalc) {
      // After a result, operators continue; digits start fresh
      if (/^[0-9.]$/.test(val)) {
        state.expression = val;
        dispExpr.textContent = '';
      } else {
        // continue with previous answer
        state.expression = fmt(state.answer) + val;
      }
      state.justCalc = false;
    } else {
      if (state.expression === '0' || state.expression === 'Error') {
        state.expression = /^[+\-×÷^]$/.test(val) ? '0' + val : val;
      } else {
        state.expression += val;
      }
    }
    updateDisplay();
  }

  function calcClear() {
    state.expression = '';
    state.justCalc = false;
    dispExpr.textContent = '';
    dispSec.textContent = '';
    updateDisplay();
  }

  function calcBack() {
    if (state.justCalc) { calcClear(); return; }
    state.expression = state.expression.slice(0, -1);
    updateDisplay();
  }

  function calcCalculate() {
    const src = state.expression;
    if (!src) return;
    try {
      const result = evaluate(src);
      if (!isFinite(result) && isNaN(result)) throw new Error('Not a number');
      const r = fmt(result);
      dispExpr.textContent = src + ' =';
      dispSec.textContent = '';
      state.expression = r;
      state.answer = result;
      state.justCalc = true;
      historyAdd(src, r, 'Scientific');
      updateDisplay();
    } catch (err) {
      dispExpr.textContent = src;
      state.expression = 'Error: ' + err.message;
      state.justCalc = true;
      updateDisplay();
      showToast(err.message);
    }
  }

  function calcUnary(fn) {
    const src = state.expression || '0';
    try {
      const v = evaluate(src);
      let result, label;
      switch (fn) {
        case 'square':    result = v * v;        label = `(${fmt(v)})²`; break;
        case 'cube':      result = v * v * v;    label = `(${fmt(v)})³`; break;
        case 'sqrt':      if (v < 0) throw new Error('√ of negative'); result = Math.sqrt(v); label = `√(${fmt(v)})`; break;
        case 'cbrt':      result = Math.cbrt(v); label = `∛(${fmt(v)})`; break;
        case 'inverse':   if (v === 0) throw new Error('1/0 undefined'); result = 1/v; label = `1/(${fmt(v)})`; break;
        case 'log':       if (v <= 0) throw new Error('log domain error'); result = Math.log10(v); label = `log(${fmt(v)})`; break;
        case 'ln':        if (v <= 0) throw new Error('ln domain error'); result = Math.log(v); label = `ln(${fmt(v)})`; break;
        case 'log2':      if (v <= 0) throw new Error('log₂ domain error'); result = Math.log2(v); label = `log₂(${fmt(v)})`; break;
        case 'tenPower':  result = Math.pow(10, v); label = `10^(${fmt(v)})`; break;
        case 'sin':       result = evaluate(`sin(${v})`); label = `sin(${fmt(v)})`; break;
        case 'cos':       result = evaluate(`cos(${v})`); label = `cos(${fmt(v)})`; break;
        case 'tan':       result = evaluate(`tan(${v})`); label = `tan(${fmt(v)})`; break;
        case 'asin':      result = evaluate(`asin(${v})`); label = `sin⁻¹(${fmt(v)})`; break;
        case 'acos':      result = evaluate(`acos(${v})`); label = `cos⁻¹(${fmt(v)})`; break;
        case 'atan':      result = evaluate(`atan(${v})`); label = `tan⁻¹(${fmt(v)})`; break;
        case 'sinh':      result = Math.sinh(v); label = `sinh(${fmt(v)})`; break;
        case 'cosh':      result = Math.cosh(v); label = `cosh(${fmt(v)})`; break;
        case 'tanh':      result = Math.tanh(v); label = `tanh(${fmt(v)})`; break;
        case 'factorial': result = factorial(v); label = `${fmt(v)}!`; break;
        case 'abs':       result = Math.abs(v);  label = `|${fmt(v)}|`; break;
        case 'toggleSign': result = -v;          label = `-(${fmt(v)})`; break;
        case 'percent':   result = v / 100;      label = `${fmt(v)}%`; break;
        default: return;
      }
      const r = fmt(result);
      dispExpr.textContent = label + ' =';
      state.expression = r;
      state.answer = result;
      state.justCalc = true;
      historyAdd(label, r, 'Scientific');
      updateDisplay();
    } catch (err) {
      state.expression = 'Error: ' + err.message;
      state.justCalc = true;
      updateDisplay();
      showToast(err.message);
    }
  }

  function calcAction(a) {
    // Unary operations
    const unaryOps = ['square','cube','sqrt','cbrt','inverse','log','ln','log2','tenPower',
                      'sin','cos','tan','asin','acos','atan','sinh','cosh','tanh',
                      'factorial','abs','toggleSign','percent'];
    if (unaryOps.includes(a)) { calcUnary(a); return; }

    switch (a) {
      case 'clear':          calcClear(); break;
      case 'backspace':      calcBack(); break;
      case 'equals':         calcCalculate(); break;
      case 'decimal':        calcAppend('.'); break;
      case 'add':            calcAppend('+'); break;
      case 'subtract':       calcAppend('-'); break;
      case 'multiply':       calcAppend('×'); break;
      case 'divide':         calcAppend('÷'); break;
      case 'power':          calcAppend('^'); break;
      case 'mod':            calcAppend(' mod '); break;
      case 'openParen':      calcAppend('('); break;
      case 'closeParen':     calcAppend(')'); break;
      case 'pi':             calcAppend('π'); break;
      case 'e':              calcAppend('e'); break;
      case 'ans':            calcAppend('Ans'); break;
      case 'exp':            calcAppend('e'); break;
      case 'perm':           calcAppend('npr('); break;
      case 'comb':           calcAppend('ncr('); break;
      case 'fraction':       calcAppend('/'); break;
      case 'random':         calcAppend(fmt(Math.random())); break;
      case 'sci-notation':   calcAppend('×10^'); break;
      case 'memoryClear':    state.memory = 0; updateDisplay(); break;
      case 'memoryRecall':   calcAppend(fmt(state.memory)); break;
      case 'memoryAdd':
        try { state.memory += evaluate(state.expression || '0'); updateDisplay(); showToast('Added to memory'); }
        catch (err) { showToast(err.message); }
        break;
      case 'memorySubtract':
        try { state.memory -= evaluate(state.expression || '0'); updateDisplay(); showToast('Subtracted from memory'); }
        catch (err) { showToast(err.message); }
        break;
    }
  }

  // Wire up all calculator buttons
  $$('.cb').forEach(btn => {
    btn.addEventListener('click', e => {
      addRipple(btn, e);
      if (btn.dataset.number !== undefined) {
        calcAppend(btn.dataset.number);
      } else if (btn.dataset.action) {
        calcAction(btn.dataset.action);
      }
    });
  });

  // Angle mode
  $('#degBtn')?.addEventListener('click', () => {
    state.angle = 'DEG';
    $('#degBtn').classList.add('active');
    $('#radBtn').classList.remove('active');
    $('#settingDeg')?.classList.add('active');
    $('#settingRad')?.classList.remove('active');
    saveState();
  });
  $('#radBtn')?.addEventListener('click', () => {
    state.angle = 'RAD';
    $('#radBtn').classList.add('active');
    $('#degBtn').classList.remove('active');
    $('#settingRad')?.classList.add('active');
    $('#settingDeg')?.classList.remove('active');
    saveState();
  });

  // Apply saved angle mode
  if (state.angle === 'RAD') {
    $('#radBtn')?.classList.add('active');
    $('#degBtn')?.classList.remove('active');
  }

  // Keyboard support
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    const active = $('.panel.active')?.id;
    if (active !== 'panel-scientific') return;

    if (e.key >= '0' && e.key <= '9') calcAppend(e.key);
    else if (e.key === '.') calcAppend('.');
    else if (e.key === 'Enter' || e.key === '=') calcCalculate();
    else if (e.key === 'Backspace') calcBack();
    else if (e.key === 'Escape') calcClear();
    else if (e.key === '+') calcAppend('+');
    else if (e.key === '-') calcAppend('-');
    else if (e.key === '*') calcAppend('×');
    else if (e.key === '/') { e.preventDefault(); calcAppend('÷'); }
    else if (e.key === '^') calcAppend('^');
    else if (e.key === '(') calcAppend('(');
    else if (e.key === ')') calcAppend(')');
    else if (e.key === '%') calcUnary('percent');
  });

  // Copy result
  document.addEventListener('copy-result', async () => {
    try {
      await navigator.clipboard.writeText(state.expression);
      showToast('Result copied to clipboard');
    } catch (_) { showToast('Copy not supported'); }
  });

  updateDisplay();

  /* ═══════════════════════════════════════════
     HISTORY
  ═══════════════════════════════════════════ */
  function historyAdd(expr, result, module = 'Scientific') {
    state.history.unshift({ expr, result, module, time: Date.now() });
    state.history = state.history.slice(0, 300);
    saveState();
    renderHistoryList();
    renderSciHistory();
    updateHistoryBadge();
  }

  function renderHistoryList(filter = '') {
    const list = $('#historyList');
    if (!list) return;
    const items = filter
      ? state.history.filter(h => `${h.expr} ${h.result}`.toLowerCase().includes(filter.toLowerCase()))
      : state.history;

    if (!items.length) {
      list.innerHTML = `<div class="history-empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        No calculations yet
      </div>`;
      return;
    }

    list.innerHTML = items.map((h, i) => `
      <button class="history-item" data-idx="${i}">
        <span class="hi-expr">${esc(h.expr)}</span>
        <span class="hi-result">${esc(h.result)}</span>
        <span class="hi-meta">
          <span class="hi-module-tag">${esc(h.module)}</span>
          ${new Date(h.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
        </span>
      </button>
    `).join('');

    $$('.history-item', list).forEach(btn => {
      btn.addEventListener('click', () => {
        const h = state.history[Number(btn.dataset.idx)];
        if (!h) return;
        state.expression = h.expr;
        state.justCalc = false;
        dispExpr.textContent = '';
        updateDisplay();
        closeHistory();
        switchPanel('scientific');
      });
    });
  }

  function renderSciHistory() {
    const list = $('#sciHistoryList');
    if (!list) return;
    const items = state.history.slice(0, 20);
    if (!items.length) {
      list.innerHTML = '<div class="history-empty">No calculations yet</div>';
      return;
    }
    list.innerHTML = items.map((h, i) => `
      <button class="history-mini-item" data-idx="${i}">
        <div class="h-expr">${esc(h.expr)}</div>
        <div class="h-result">= ${esc(h.result)}</div>
      </button>
    `).join('');

    $$('.history-mini-item', list).forEach(btn => {
      btn.addEventListener('click', () => {
        const h = state.history[Number(btn.dataset.idx)];
        if (!h) return;
        state.expression = h.expr;
        state.justCalc = false;
        dispExpr.textContent = '';
        updateDisplay();
      });
    });
  }

  function updateHistoryBadge() {
    const badge = $('#historyBadge');
    if (badge) badge.textContent = Math.min(state.history.length, 999);
  }

  // History drawer controls
  function openHistory() {
    $('#historyDrawer')?.classList.add('open');
    $('#historyOverlay')?.classList.add('visible');
  }
  function closeHistory() {
    $('#historyDrawer')?.classList.remove('open');
    $('#historyOverlay')?.classList.remove('visible');
  }

  $('#historyToggleBtn')?.addEventListener('click', openHistory);
  $('#historyCloseBtn')?.addEventListener('click', closeHistory);
  $('#historyOverlay')?.addEventListener('click', closeHistory);

  $('#historySearchInput')?.addEventListener('input', e => renderHistoryList(e.target.value));

  $('#clearAllHistoryBtn')?.addEventListener('click', () => {
    state.history = [];
    saveState();
    renderHistoryList();
    renderSciHistory();
    updateHistoryBadge();
    showToast('History cleared');
  });

  $('#clearHistoryMiniBtn')?.addEventListener('click', () => {
    state.history = [];
    saveState();
    renderHistoryList();
    renderSciHistory();
    updateHistoryBadge();
  });

  $('#exportHistoryBtn')?.addEventListener('click', () => {
    const txt = state.history.map(h =>
      `[${new Date(h.time).toLocaleString()}] ${h.module}: ${h.expr} = ${h.result}`
    ).join('\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'nexus-history.txt'; a.click();
    URL.revokeObjectURL(url);
    showToast('History exported');
  });

  // Init history display
  renderHistoryList();
  renderSciHistory();
  updateHistoryBadge();

  /* ═══════════════════════════════════════════
     SETTINGS MODAL
  ═══════════════════════════════════════════ */
  function openSettings() {
    const ov = $('#settingsOverlay');
    if (ov) { ov.style.display = 'flex'; }
    // Sync settings UI
    $('#settingPrecision').value = String(state.precision);
    $('#settingSciNotation').checked = state.sciNotation;
    if (state.angle === 'DEG') {
      $('#settingDeg')?.classList.add('active');
      $('#settingRad')?.classList.remove('active');
    } else {
      $('#settingRad')?.classList.add('active');
      $('#settingDeg')?.classList.remove('active');
    }
    if (state.theme === 'dark') {
      $('#settingDarkTheme')?.classList.add('active');
      $('#settingLightTheme')?.classList.remove('active');
    } else {
      $('#settingLightTheme')?.classList.add('active');
      $('#settingDarkTheme')?.classList.remove('active');
    }
  }
  function closeSettings() {
    const ov = $('#settingsOverlay');
    if (ov) ov.style.display = 'none';
  }

  $('#settingsBtn')?.addEventListener('click', openSettings);
  $('#settingsCloseBtn')?.addEventListener('click', closeSettings);
  $('#settingsOverlay')?.addEventListener('click', e => { if (e.target === $('#settingsOverlay')) closeSettings(); });

  $('#settingDeg')?.addEventListener('click', () => {
    state.angle = 'DEG';
    $('#settingDeg').classList.add('active');
    $('#settingRad')?.classList.remove('active');
    $('#degBtn')?.classList.add('active');
    $('#radBtn')?.classList.remove('active');
    saveState();
  });
  $('#settingRad')?.addEventListener('click', () => {
    state.angle = 'RAD';
    $('#settingRad').classList.add('active');
    $('#settingDeg')?.classList.remove('active');
    $('#radBtn')?.classList.add('active');
    $('#degBtn')?.classList.remove('active');
    saveState();
  });
  $('#settingDarkTheme')?.addEventListener('click', () => applyTheme('dark'));
  $('#settingLightTheme')?.addEventListener('click', () => applyTheme('light'));

  $('#settingPrecision')?.addEventListener('change', e => {
    state.precision = Number(e.target.value);
    saveState();
  });
  $('#settingSciNotation')?.addEventListener('change', e => {
    state.sciNotation = e.target.checked;
    saveState();
  });

  // Variables
  $('#openVarsBtn')?.addEventListener('click', () => {
    closeSettings();
    openVarsModal();
  });

  function openVarsModal() {
    const ov = $('#varsOverlay');
    if (ov) { ov.style.display = 'flex'; renderVarsList(); }
  }
  function closeVarsModal() {
    const ov = $('#varsOverlay');
    if (ov) ov.style.display = 'none';
  }

  $('#varsCloseBtn')?.addEventListener('click', closeVarsModal);
  $('#varsOverlay')?.addEventListener('click', e => { if (e.target === $('#varsOverlay')) closeVarsModal(); });

  $('#addVarBtn')?.addEventListener('click', () => {
    const name = $('#varName').value.trim();
    const val = Number($('#varValue').value);
    if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      showToast('Invalid variable name'); return;
    }
    if (isNaN(val)) { showToast('Invalid value'); return; }
    state.variables[name] = val;
    saveState();
    renderVarsList();
    $('#varName').value = '';
    $('#varValue').value = '';
    showToast(`Variable ${name} = ${val} saved`);
  });

  function renderVarsList() {
    const list = $('#varsList');
    if (!list) return;
    const keys = Object.keys(state.variables);
    if (!keys.length) {
      list.innerHTML = '<div style="color:var(--text-3);font-size:12px;">No variables defined</div>';
      return;
    }
    list.innerHTML = keys.map(k => `
      <div class="var-item">
        <span class="var-name">${esc(k)}</span>
        <span class="var-eq">=</span>
        <span class="var-val">${fmt(state.variables[k], 10)}</span>
        <button class="var-remove-btn" data-var="${esc(k)}">×</button>
      </div>
    `).join('');
    $$('.var-remove-btn', list).forEach(btn => {
      btn.addEventListener('click', () => {
        delete state.variables[btn.dataset.var];
        saveState();
        renderVarsList();
      });
    });
  }

  /* ═══════════════════════════════════════════
     GRAPHING CALCULATOR
  ═══════════════════════════════════════════ */
  const EQ_COLORS = ['#a78bfa', '#fb923c', '#34d399', '#f472b6', '#38bdf8', '#facc15'];

  function getGraphCanvas() {
    return /** @type {HTMLCanvasElement|null} */ ($('#graphCanvas'));
  }

  function drawGraph() {
    const canvas = getGraphCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = rect.width;
    const H = rect.height;
    if (W === 0 || H === 0) return;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const style = getComputedStyle(document.documentElement);
    const graphBg   = style.getPropertyValue('--graph-bg').trim();
    const gridCol   = style.getPropertyValue('--graph-grid').trim();
    const axisCol   = style.getPropertyValue('--graph-axis').trim();
    const textCol   = style.getPropertyValue('--text-3').trim();

    const cx = W / 2 + state.graphOffX;
    const cy = H / 2 + state.graphOffY;
    const s  = state.graphScale;

    // Background
    ctx.fillStyle = graphBg;
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = gridCol;
    ctx.lineWidth = 1;
    const startX = cx % s;
    const startY = cy % s;
    for (let x = startX; x <= W; x += s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = startY; y <= H; y += s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Axis
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

    // Axis labels
    ctx.fillStyle = textCol;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    const labelStep = s >= 40 ? 1 : s >= 20 ? 2 : 5;
    for (let i = Math.ceil(-cx / s); i <= Math.floor((W - cx) / s); i++) {
      if (i === 0) continue;
      const px = cx + i * s;
      if (px < 10 || px > W - 10) continue;
      ctx.fillText(i * labelStep === i ? String(i) : '', px, cy + 14);
    }
    ctx.textAlign = 'right';
    for (let i = Math.ceil(-(H - cy) / s); i <= Math.floor(cy / s); i++) {
      if (i === 0) continue;
      const py = cy - i * s;
      if (py < 10 || py > H - 10) continue;
      ctx.fillText(String(i), cx - 6, py + 3);
    }

    // Plot each equation
    state.equations.forEach((eq, idx) => {
      if (!eq.trim()) return;
      ctx.beginPath();
      ctx.strokeStyle = EQ_COLORS[idx % EQ_COLORS.length];
      ctx.lineWidth = 2.2;
      let started = false;
      let prevY = null;
      for (let px = 0; px <= W; px++) {
        const xVal = (px - cx) / s;
        try {
          const yVal = evaluate(eq.replace(/\bx\b/g, `(${xVal})`));
          const py = cy - yVal * s;
          if (!isFinite(py) || Math.abs(py - cy) > H * 20) {
            started = false; prevY = null; continue;
          }
          // Discontinuity detection
          if (prevY !== null && Math.abs(py - prevY) > H * 2) {
            started = false;
          }
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
          prevY = py;
        } catch (_) { started = false; prevY = null; }
      }
      ctx.stroke();
    });

    // Update legend
    renderGraphLegend();
  }

  function renderGraphLegend() {
    const legend = $('#graphLegend');
    if (!legend) return;
    legend.innerHTML = state.equations.map((eq, i) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${EQ_COLORS[i % EQ_COLORS.length]}"></span>
        y = ${esc(eq)}
      </div>
    `).join('');
  }

  function renderGraphEqInputs() {
    const wrap = $('#graphEqInputs');
    if (!wrap) return;
    wrap.innerHTML = state.equations.map((eq, i) => `
      <div class="graph-eq-row">
        <span class="eq-color-dot" style="background:${EQ_COLORS[i % EQ_COLORS.length]}"></span>
        <input class="graph-input" value="${esc(eq)}" placeholder="f(x) = …" data-eq-index="${i}" />
        <button class="eq-remove-btn" data-remove="${i}">×</button>
      </div>
    `).join('');

    $$('.graph-input', wrap).forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = Number(e.target.dataset.eqIndex);
        state.equations[idx] = e.target.value;
        drawGraph();
      });
    });
    $$('.eq-remove-btn', wrap).forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.remove);
        state.equations.splice(idx, 1);
        renderGraphEqInputs();
        drawGraph();
      });
    });
  }

  $('#addEqBtn')?.addEventListener('click', () => {
    if (state.equations.length >= 6) { showToast('Maximum 6 equations'); return; }
    state.equations.push('');
    renderGraphEqInputs();
    setTimeout(() => {
      const inputs = $$('.graph-input');
      inputs[inputs.length - 1]?.focus();
    }, 50);
  });

  $('#graphZoomInBtn')?.addEventListener('click', () => { state.graphScale *= 1.25; drawGraph(); });
  $('#graphZoomOutBtn')?.addEventListener('click', () => { state.graphScale = Math.max(5, state.graphScale / 1.25); drawGraph(); });
  $('#graphResetBtn')?.addEventListener('click', () => {
    state.graphScale = 50; state.graphOffX = 0; state.graphOffY = 0;
    state.equations = ['sin(x)', 'cos(x)'];
    renderGraphEqInputs();
    drawGraph();
  });

  $('#graphAnalyzeBtn')?.addEventListener('click', () => {
    const bar = $('#graphAnalysisBar');
    if (!bar) return;
    const lines = [];
    state.equations.forEach((eq, i) => {
      if (!eq.trim()) return;
      const roots = [];
      let prevY = null;
      for (let x = -20; x <= 20; x += 0.05) {
        try {
          const y = evaluate(eq.replace(/\bx\b/g, `(${x})`));
          if (prevY !== null && prevY * y < 0) {
            const root = x - 0.025;
            if (!roots.some(r => Math.abs(r - root) < 0.1)) roots.push(fmt(root, 4));
          }
          prevY = y;
        } catch (_) { prevY = null; }
      }
      // Local extrema
      let extrema = [];
      for (let x = -20; x <= 20; x += 0.1) {
        try {
          const h = 0.001;
          const f1 = evaluate(eq.replace(/\bx\b/g, `(${x-h})`));
          const f2 = evaluate(eq.replace(/\bx\b/g, `(${x})`));
          const f3 = evaluate(eq.replace(/\bx\b/g, `(${x+h})`));
          if ((f1 < f2 && f2 > f3) || (f1 > f2 && f2 < f3)) {
            if (!extrema.some(e => Math.abs(e.x - x) < 0.2)) {
              extrema.push({ x: fmt(x, 4), y: fmt(f2, 4), type: f1 < f2 ? 'max' : 'min' });
            }
          }
        } catch (_) {}
      }
      lines.push(`y = ${eq}:`);
      lines.push(`  Roots ≈ [${roots.slice(0,8).join(', ') || 'none in [-20,20]'}]`);
      if (extrema.length) lines.push(`  Extrema: ${extrema.slice(0,4).map(e => `${e.type}(${e.x}, ${e.y})`).join('; ')}`);
    });
    bar.textContent = lines.join('\n') || 'No functions to analyze';
  });

  // Canvas pan & zoom
  const gc = getGraphCanvas();
  if (gc) {
    gc.addEventListener('wheel', e => {
      e.preventDefault();
      state.graphScale *= e.deltaY < 0 ? 1.1 : 0.9;
      state.graphScale = Math.max(5, Math.min(500, state.graphScale));
      drawGraph();
    }, { passive: false });

    let dragging = false, lastDrag = [0, 0];
    gc.addEventListener('pointerdown', e => {
      dragging = true; lastDrag = [e.clientX, e.clientY];
      gc.setPointerCapture(e.pointerId);
    });
    gc.addEventListener('pointermove', e => {
      if (!dragging) return;
      state.graphOffX += e.clientX - lastDrag[0];
      state.graphOffY += e.clientY - lastDrag[1];
      lastDrag = [e.clientX, e.clientY];
      drawGraph();
      const xVal = fmt(-state.graphOffX / state.graphScale, 3);
      const yVal = fmt( state.graphOffY / state.graphScale, 3);
      const info = $('#graphCrosshairInfo');
      if (info) info.textContent = `center ≈ (${xVal}, ${yVal})`;
    });
    gc.addEventListener('pointerup', () => { dragging = false; });
  }

  // Resize observer for graph
  const graphWrap = gc?.parentElement;
  if (graphWrap) {
    new ResizeObserver(() => {
      if ($('#panel-graphing')?.classList.contains('active')) drawGraph();
    }).observe(graphWrap);
  }

  // Init graph inputs
  renderGraphEqInputs();

  /* ═══════════════════════════════════════════
     EQUATION SOLVER
  ═══════════════════════════════════════════ */
  function renderSolverInputs() {
    const type = $('#solverType')?.value;
    const wrap = $('#solverInputs');
    if (!wrap) return;

    const html = {
      linear: `
        <label>a <input class="styled-input" id="slvA" value="2" type="number" step="any"/></label>
        <label>b <input class="styled-input" id="slvB" value="-3" type="number" step="any"/></label>
        <label>c <input class="styled-input" id="slvC" value="5" type="number" step="any"/></label>
        <small style="color:var(--text-3);font-size:11px;grid-column:1/-1">ax + b = c</small>`,
      quadratic: `
        <label>a <input class="styled-input" id="slvA" value="1" type="number" step="any"/></label>
        <label>b <input class="styled-input" id="slvB" value="-5" type="number" step="any"/></label>
        <label>c <input class="styled-input" id="slvC" value="6" type="number" step="any"/></label>
        <small style="color:var(--text-3);font-size:11px;grid-column:1/-1">ax² + bx + c = 0</small>`,
      polynomial: `
        <label style="grid-column:1/-1">Coefficients (highest degree first, comma-separated)
          <input class="styled-input" id="slvPoly" value="1,-6,11,-6" placeholder="e.g. 1,0,-4"/>
        </label>`,
      simultaneous: `
        <label>a₁ <input class="styled-input" id="slvA1" value="2" type="number" step="any"/></label>
        <label>b₁ <input class="styled-input" id="slvB1" value="1" type="number" step="any"/></label>
        <label>c₁ <input class="styled-input" id="slvC1" value="5" type="number" step="any"/></label>
        <label>a₂ <input class="styled-input" id="slvA2" value="1" type="number" step="any"/></label>
        <label>b₂ <input class="styled-input" id="slvB2" value="-1" type="number" step="any"/></label>
        <label>c₂ <input class="styled-input" id="slvC2" value="1" type="number" step="any"/></label>
        <small style="color:var(--text-3);font-size:11px;grid-column:1/-1">a₁x + b₁y = c₁ &nbsp;|&nbsp; a₂x + b₂y = c₂</small>`,
      cubic: `
        <label>a <input class="styled-input" id="slvA" value="1" type="number" step="any"/></label>
        <label>b <input class="styled-input" id="slvB" value="-6" type="number" step="any"/></label>
        <label>c <input class="styled-input" id="slvC" value="11" type="number" step="any"/></label>
        <label>d <input class="styled-input" id="slvD" value="-6" type="number" step="any"/></label>
        <small style="color:var(--text-3);font-size:11px;grid-column:1/-1">ax³ + bx² + cx + d = 0</small>`,
    };
    wrap.innerHTML = html[type] || '';
  }

  $('#solverType')?.addEventListener('change', () => {
    renderSolverInputs();
    $('#solverResult').innerHTML = '<div class="result-placeholder">Enter coefficients and press Solve</div>';
    $('#solverSteps').style.display = 'none';
  });

  $('#solveBtn')?.addEventListener('click', () => {
    const type = $('#solverType')?.value;
    const resCard = $('#solverResult');
    const stepsCard = $('#solverSteps');
    const stepsContent = $('#solverStepsContent');
    if (!resCard) return;

    const g = id => Number($('#' + id)?.value ?? 0);

    try {
      let resultHTML = '', stepsHTML = '', hasSteps = false;

      if (type === 'linear') {
        const a = g('slvA'), b = g('slvB'), c = g('slvC');
        stepsHTML += `<div class="result-step">Start: ${fmt(a)}x + (${fmt(b)}) = ${fmt(c)}</div>`;
        stepsHTML += `<div class="result-step">Move constant: ${fmt(a)}x = ${fmt(c)} − (${fmt(b)}) = ${fmt(c - b)}</div>`;
        if (a === 0) {
          resultHTML = b === c
            ? '<span class="result-highlight">Infinite solutions</span>'
            : '<span class="result-highlight" style="color:#f87171">No solution</span>';
          stepsHTML += '<div class="result-step">Coefficient of x is 0 → no unique solution</div>';
        } else {
          const x = (c - b) / a;
          stepsHTML += `<div class="result-step">Divide both sides by ${fmt(a)}: x = ${fmt(c-b)} ÷ ${fmt(a)}</div>`;
          resultHTML = `<div class="result-label">Solution</div><div class="result-highlight">x = ${fmt(x)}</div>`;
        }
        hasSteps = true;
      }

      else if (type === 'quadratic') {
        const a = g('slvA'), b = g('slvB'), c = g('slvC');
        if (a === 0) throw new Error('Coefficient a cannot be zero');
        const disc = b*b - 4*a*c;
        stepsHTML += `<div class="result-step">Equation: ${fmt(a)}x² + (${fmt(b)})x + (${fmt(c)}) = 0</div>`;
        stepsHTML += `<div class="result-step">Discriminant Δ = b² − 4ac = ${fmt(b)}² − 4(${fmt(a)})(${fmt(c)}) = <strong>${fmt(disc)}</strong></div>`;
        if (disc > 0) {
          const x1 = (-b + Math.sqrt(disc)) / (2*a);
          const x2 = (-b - Math.sqrt(disc)) / (2*a);
          stepsHTML += `<div class="result-step">Δ > 0 → Two real roots</div>`;
          stepsHTML += `<div class="result-step">x = (−b ± √Δ) / 2a = (−(${fmt(b)}) ± √${fmt(disc)}) / (2 × ${fmt(a)})</div>`;
          resultHTML = `<div class="result-label">Two real solutions</div>
            <div class="result-highlight">x₁ = ${fmt(x1)}</div>
            <div class="result-highlight">x₂ = ${fmt(x2)}</div>`;
        } else if (disc === 0) {
          const x = -b / (2*a);
          stepsHTML += `<div class="result-step">Δ = 0 → One repeated root</div>`;
          stepsHTML += `<div class="result-step">x = −b / 2a = ${fmt(-b)} / ${fmt(2*a)}</div>`;
          resultHTML = `<div class="result-label">Repeated root</div><div class="result-highlight">x = ${fmt(x)}</div>`;
        } else {
          const re = -b / (2*a);
          const im = Math.sqrt(-disc) / (2*a);
          stepsHTML += `<div class="result-step">Δ < 0 → Complex roots</div>`;
          resultHTML = `<div class="result-label">Complex roots</div>
            <div class="result-highlight">x₁ = ${fmt(re)} + ${fmt(im)}i</div>
            <div class="result-highlight">x₂ = ${fmt(re)} − ${fmt(im)}i</div>`;
        }
        hasSteps = true;
      }

      else if (type === 'cubic') {
        const a = g('slvA'), b = g('slvB'), c = g('slvC'), d = g('slvD');
        if (a === 0) throw new Error('Coefficient a cannot be zero');
        // Numerical root-finding via companion polynomial / bisection
        const f = x => a*x*x*x + b*x*x + c*x + d;
        const roots = findPolynomialRoots([a, b, c, d]);
        stepsHTML += `<div class="result-step">Equation: ${fmt(a)}x³ + (${fmt(b)})x² + (${fmt(c)})x + (${fmt(d)}) = 0</div>`;
        stepsHTML += `<div class="result-step">Numerical root search in range [-50, 50]</div>`;
        resultHTML = roots.length
          ? `<div class="result-label">Real roots</div>` + roots.map((r,i) => `<div class="result-highlight">x${i+1} = ${fmt(r)}</div>`).join('')
          : '<span class="result-highlight" style="color:#f87171">No real roots found in [-50, 50]</span>';
        hasSteps = true;
      }

      else if (type === 'polynomial') {
        const co = $('#slvPoly').value.split(',').map(Number);
        if (co.some(isNaN)) throw new Error('Use comma-separated numbers');
        const roots = findPolynomialRoots(co);
        stepsHTML += `<div class="result-step">Degree ${co.length-1} polynomial</div>`;
        stepsHTML += `<div class="result-step">Coefficients: [${co.map(fmt).join(', ')}]</div>`;
        stepsHTML += `<div class="result-step">Numerical Durand–Kerner root search</div>`;
        resultHTML = roots.length
          ? `<div class="result-label">Approximate real roots</div>` + roots.map((r,i) => `<div class="result-highlight">x${i+1} ≈ ${fmt(r)}</div>`).join('')
          : '<span class="result-highlight" style="color:#f87171">No real roots found in [-100, 100]</span>';
        hasSteps = true;
      }

      else if (type === 'simultaneous') {
        const a1=g('slvA1'), b1=g('slvB1'), c1=g('slvC1');
        const a2=g('slvA2'), b2=g('slvB2'), c2=g('slvC2');
        const det = a1*b2 - a2*b1;
        stepsHTML += `<div class="result-step">System: ${fmt(a1)}x + ${fmt(b1)}y = ${fmt(c1)}</div>`;
        stepsHTML += `<div class="result-step">        ${fmt(a2)}x + ${fmt(b2)}y = ${fmt(c2)}</div>`;
        stepsHTML += `<div class="result-step">Determinant D = a₁b₂ − a₂b₁ = ${fmt(a1)}×${fmt(b2)} − ${fmt(a2)}×${fmt(b1)} = ${fmt(det)}</div>`;
        if (Math.abs(det) < 1e-14) {
          resultHTML = '<span class="result-highlight" style="color:#f87171">Determinant is zero — no unique solution</span>';
        } else {
          const x = (c1*b2 - c2*b1) / det;
          const y = (a1*c2 - a2*c1) / det;
          stepsHTML += `<div class="result-step">x = (c₁b₂ − c₂b₁) / D = ${fmt(x)}</div>`;
          stepsHTML += `<div class="result-step">y = (a₁c₂ − a₂c₁) / D = ${fmt(y)}</div>`;
          resultHTML = `<div class="result-label">Solutions</div>
            <div class="result-highlight">x = ${fmt(x)}</div>
            <div class="result-highlight">y = ${fmt(y)}</div>`;
        }
        hasSteps = true;
      }

      resCard.innerHTML = resultHTML;
      if (hasSteps && stepsHTML && stepsCard && stepsContent) {
        stepsCard.style.display = 'block';
        stepsContent.innerHTML = stepsHTML;
      }
    } catch (err) {
      resCard.innerHTML = `<span class="result-placeholder" style="color:#f87171">${esc('Error: ' + err.message)}</span>`;
      if (stepsCard) stepsCard.style.display = 'none';
    }
  });

  function findPolynomialRoots(coeffs) {
    // Numerical bisection + refinement
    const f = x => coeffs.reduce((acc, c) => acc * x + c, 0);
    const roots = [];
    const step = 0.05;
    for (let x = -100; x < 100; x += step) {
      const y1 = f(x), y2 = f(x + step);
      if (isFinite(y1) && isFinite(y2) && y1 * y2 <= 0) {
        // Newton-Raphson refinement
        let r = x + step / 2;
        for (let i = 0; i < 50; i++) {
          const fv = f(r);
          const df = (f(r + 1e-8) - f(r - 1e-8)) / 2e-8;
          if (Math.abs(df) < 1e-15) break;
          const nr = r - fv / df;
          if (Math.abs(nr - r) < 1e-10) { r = nr; break; }
          r = nr;
          if (!isFinite(r)) break;
        }
        if (isFinite(r) && Math.abs(f(r)) < 1e-6 && !roots.some(rv => Math.abs(rv - r) < 0.01)) {
          roots.push(r);
        }
      }
    }
    return roots;
  }

  renderSolverInputs();

  /* ═══════════════════════════════════════════
     CALCULUS
  ═══════════════════════════════════════════ */
  $('#calculusOp')?.addEventListener('change', () => {
    const op = $('#calculusOp').value;
    const bGroup = $('#calcBGroup');
    const aLabel = $('#calcALabel');
    if (bGroup) bGroup.style.display = op === 'integral' ? 'flex' : 'none';
    if (aLabel) aLabel.textContent = op === 'integral' ? 'Lower bound a' : op === 'limit' ? 'x approaches' : 'Point x = a';
  });

  $('#runCalculusBtn')?.addEventListener('click', () => {
    const op   = $('#calculusOp').value;
    const fnSrc = $('#calcFn').value.trim();
    const a    = Number($('#calcA').value);
    const b    = Number($('#calcB').value);
    const res  = $('#calculusResult');
    if (!res) return;

    const f = x => evaluate(fnSrc.replace(/\bx\b/g, `(${x})`));

    try {
      let html = '';
      if (op === 'derivative') {
        const h = 1e-7;
        const deriv = (f(a + h) - f(a - h)) / (2 * h);
        // Second derivative for context
        const d2 = (f(a + h) - 2*f(a) + f(a - h)) / (h * h);
        html = `
          <div class="result-label">Numerical derivative using central difference (h = ${h})</div>
          <div class="result-highlight">f′(${a}) ≈ ${fmt(deriv)}</div>
          <div class="result-label" style="margin-top:10px">Second derivative</div>
          <div class="result-value">f″(${a}) ≈ ${fmt(d2)}</div>
          <div class="result-label" style="margin-top:10px">Function value</div>
          <div class="result-value">f(${a}) = ${fmt(f(a))}</div>`;
        historyAdd(`f′(${a}) of ${fnSrc}`, fmt(deriv), 'Calculus');
      }

      else if (op === 'integral') {
        if (a >= b) throw new Error('Lower bound must be less than upper bound');
        const n = 10000;
        const h = (b - a) / n;
        // Simpson's rule
        let sum = f(a) + f(b);
        for (let i = 1; i < n; i++) {
          sum += (i % 2 === 0 ? 2 : 4) * f(a + i * h);
        }
        const integral = (sum * h) / 3;
        // Trapezoidal for comparison
        let trap = (f(a) + f(b)) / 2;
        for (let i = 1; i < n; i++) trap += f(a + i * h);
        trap *= h;
        html = `
          <div class="result-label">Definite integral ∫[${a}, ${b}] f(x) dx</div>
          <div class="result-highlight">≈ ${fmt(integral)}</div>
          <div class="result-label" style="margin-top:10px">Method: Simpson's Rule (n = ${n})</div>
          <div class="result-value">Trapezoidal check: ${fmt(trap)}</div>`;
        historyAdd(`∫[${a},${b}] ${fnSrc} dx`, fmt(integral), 'Calculus');
      }

      else if (op === 'limit') {
        const h = 1e-8;
        const left  = f(a - h);
        const right = f(a + h);
        const diff  = Math.abs(left - right);
        const limit = (left + right) / 2;
        if (diff < 1e-6) {
          html = `
            <div class="result-label">lim(x → ${a}) f(x)</div>
            <div class="result-highlight">≈ ${fmt(limit)}</div>
            <div class="result-label" style="margin-top:10px">Left limit: ${fmt(left)} · Right limit: ${fmt(right)}</div>
            <div class="result-value">Limit exists (difference = ${diff.toExponential(2)})</div>`;
        } else {
          html = `
            <div class="result-label">lim(x → ${a}) f(x)</div>
            <div class="result-highlight" style="color:#f87171">Limit may not exist</div>
            <div class="result-label" style="margin-top:10px">Left: ${fmt(left)}&nbsp;&nbsp;Right: ${fmt(right)}</div>`;
        }
        historyAdd(`lim(x→${a}) ${fnSrc}`, fmt(limit), 'Calculus');
      }

      else if (op === 'taylor') {
        // Taylor series around x=0 to degree 7
        const terms = [];
        const h = 1e-5;
        let deriv = f;
        const nd = x => {
          const vals = [];
          for (let k = 0; k <= 7; k++) {
            const hk = h;
            vals.push(0);
          }
        };
        // Finite differences for Taylor coefficients
        const coeffs = [];
        let fact = 1;
        for (let n = 0; n <= 7; n++) {
          if (n > 0) fact *= n;
          // n-th derivative at 0 via central differences
          let dn = 0;
          for (let k = 0; k <= n; k++) {
            const sign = ((n - k) % 2 === 0) ? 1 : -1;
            const binom = factorial(n) / (factorial(k) * factorial(n - k));
            const xk = (n / 2 - k) * h;
            dn += sign * binom * f(xk);
          }
          dn /= Math.pow(h, n);
          const c = dn / fact;
          if (Math.abs(c) > 1e-10) {
            const exp = n === 0 ? '' : n === 1 ? 'x' : `x^${n}`;
            terms.push(`${fmt(c, 4)}${exp}`);
          }
          coeffs.push(c);
        }
        html = `
          <div class="result-label">Taylor series of f(x) around x = 0</div>
          <div class="result-highlight" style="font-size:14px">f(x) ≈ ${terms.slice(0, 5).join(' + ') || '0'}</div>
          <div class="result-label" style="margin-top:10px">f(0) = ${fmt(f(0))}</div>`;
      }

      res.innerHTML = html;
    } catch (err) {
      res.innerHTML = `<span class="result-placeholder" style="color:#f87171">${esc('Error: ' + err.message)}</span>`;
    }
  });

  // Init calculus UI
  const calcOpEl = $('#calculusOp');
  if (calcOpEl) {
    const ev = new Event('change');
    calcOpEl.dispatchEvent(ev);
  }

  /* ═══════════════════════════════════════════
     STATISTICS & PROBABILITY
  ═══════════════════════════════════════════ */
  let statsData = [];

  $('#runStatsBtn')?.addEventListener('click', () => {
    const raw = $('#statsData').value;
    const vals = raw.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (!vals.length || vals.some(isNaN)) {
      $('#statsResult').innerHTML = '<span class="result-placeholder" style="color:#f87171">Invalid data: enter numbers separated by commas or spaces</span>';
      return;
    }
    statsData = vals;
    const res = analyzeStats(vals);
    $('#statsResult').innerHTML = res.html;
    drawStatsChart();
  });

  function analyzeStats(vals) {
    const n = vals.length;
    const sum = vals.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const sorted = [...vals].sort((a, b) => a - b);
    const median = n % 2 === 0
      ? (sorted[n/2 - 1] + sorted[n/2]) / 2
      : sorted[Math.floor(n/2)];
    const freq = {};
    vals.forEach(v => freq[v] = (freq[v] || 0) + 1);
    const maxFreq = Math.max(...Object.values(freq));
    const mode = Object.entries(freq).filter(([,f]) => f === maxFreq).map(([v]) => Number(v));
    const popVar = vals.reduce((a, v) => a + (v - mean)**2, 0) / n;
    const sampVar = vals.reduce((a, v) => a + (v - mean)**2, 0) / (n - 1 || 1);
    const q1 = percentile(sorted, 25);
    const q3 = percentile(sorted, 75);
    const iqr = q3 - q1;
    const skew = vals.reduce((a, v) => a + ((v - mean) / Math.sqrt(popVar))**3, 0) / n;

    historyAdd(`Stats(n=${n})`, `mean=${fmt(mean)}, σ=${fmt(Math.sqrt(popVar))}`, 'Statistics');

    return {
      html: `
        <div class="result-label">Descriptive Statistics (n = ${n})</div>
        <div class="result-step"><span style="color:var(--text-3)">Sum</span> = <strong>${fmt(sum)}</strong></div>
        <div class="result-step"><span style="color:var(--text-3)">Mean</span> = <strong>${fmt(mean)}</strong></div>
        <div class="result-step"><span style="color:var(--text-3)">Median</span> = <strong>${fmt(median)}</strong></div>
        <div class="result-step"><span style="color:var(--text-3)">Mode</span> = <strong>${mode.map(fmt).join(', ')}</strong></div>
        <div class="result-step"><span style="color:var(--text-3)">Min / Max</span> = <strong>${fmt(sorted[0])} / ${fmt(sorted[n-1])}</strong></div>
        <div class="result-step"><span style="color:var(--text-3)">Range</span> = <strong>${fmt(sorted[n-1] - sorted[0])}</strong></div>
        <div class="result-step"><span style="color:var(--text-3)">Q1 / Q3 / IQR</span> = <strong>${fmt(q1)} / ${fmt(q3)} / ${fmt(iqr)}</strong></div>
        <div class="result-step"><span style="color:var(--text-3)">Pop. Variance σ²</span> = <strong>${fmt(popVar)}</strong></div>
        <div class="result-step"><span style="color:var(--text-3)">Pop. Std Dev σ</span> = <strong style="color:var(--orange-2)">${fmt(Math.sqrt(popVar))}</strong></div>
        <div class="result-step"><span style="color:var(--text-3)">Sample Variance s²</span> = <strong>${fmt(sampVar)}</strong></div>
        <div class="result-step"><span style="color:var(--text-3)">Sample Std Dev s</span> = <strong>${fmt(Math.sqrt(sampVar))}</strong></div>
        <div class="result-step"><span style="color:var(--text-3)">Skewness</span> = <strong>${fmt(skew, 4)}</strong></div>`,
      mean, median, mode, sorted
    };
  }

  function percentile(sorted, p) {
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  $('#runProbBtn')?.addEventListener('click', () => {
    const n = Number($('#probN').value);
    const r = Number($('#probR').value);
    const resCard = $('#probResult');
    if (!resCard) return;
    try {
      const perm = nPr(n, r);
      const comb = nCr(n, r);
      resCard.style.display = 'block';
      resCard.innerHTML = `
        <div class="result-label">Combinatorics: n = ${n}, r = ${r}</div>
        <div class="result-step">nPr (Permutations) = <strong style="color:var(--orange-2)">${fmt(perm)}</strong></div>
        <div class="result-step">nCr (Combinations) = <strong style="color:var(--accent-2)">${fmt(comb)}</strong></div>
        <div class="result-step">Probability (1/nCr) = <strong>${fmt(1/comb, 6)}</strong></div>`;
      historyAdd(`P(${n},${r}) / C(${n},${r})`, `${fmt(perm)} / ${fmt(comb)}`, 'Statistics');
    } catch (err) {
      resCard.style.display = 'block';
      resCard.innerHTML = `<span class="result-placeholder" style="color:#f87171">${esc(err.message)}</span>`;
    }
  });

  function drawStatsChart() {
    const canvas = $('#statsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 300;
    const H = 220;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const style = getComputedStyle(document.documentElement);
    const bg   = style.getPropertyValue('--surface-2').trim();
    const bar  = style.getPropertyValue('--accent').trim();
    const bar2 = style.getPropertyValue('--orange').trim();
    const text = style.getPropertyValue('--text-3').trim();
    const grid = style.getPropertyValue('--graph-grid').trim();

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (!statsData.length) {
      ctx.fillStyle = text;
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Run analysis to see chart', W/2, H/2);
      return;
    }

    const pad = { top: 20, right: 16, bottom: 32, left: 40 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;

    // Build histogram bins
    const vals = statsData;
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const bins = Math.min(Math.max(5, Math.ceil(Math.sqrt(vals.length))), 15);
    const binW = range / bins;
    const counts = new Array(bins).fill(0);
    vals.forEach(v => {
      const idx = Math.min(Math.floor((v - minV) / binW), bins - 1);
      counts[idx]++;
    });
    const maxCount = Math.max(...counts);

    // Grid lines
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + cH - (i / 4) * cH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    }

    // Bars
    const barW = cW / bins;
    counts.forEach((count, i) => {
      const barH = (count / maxCount) * cH;
      const x = pad.left + i * barW;
      const y = pad.top + cH - barH;
      const grad = ctx.createLinearGradient(x, y, x, y + barH);
      grad.addColorStop(0, bar2);
      grad.addColorStop(1, bar);
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x + 2, y, barW - 4, Math.max(barH, 1), 3);
      } else {
        ctx.rect(x + 2, y, barW - 4, Math.max(barH, 1));
      }
      ctx.fill();
    });

    // X axis labels
    ctx.fillStyle = text;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= bins; i += Math.ceil(bins / 5)) {
      const v = minV + i * binW;
      ctx.fillText(fmt(v, 3), pad.left + i * barW, H - 8);
    }

    // Y axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + cH - (i / 4) * cH;
      const v = Math.round((i / 4) * maxCount);
      ctx.fillText(String(v), pad.left - 5, y + 3);
    }
  }

  /* ═══════════════════════════════════════════
     MATRIX CALCULATOR
  ═══════════════════════════════════════════ */
  function parseMatrix(src) {
    const rows = src.trim().split(';').map(r => r.split(',').map(s => {
      const n = Number(s.trim());
      if (isNaN(n)) throw new Error(`"${s.trim()}" is not a number`);
      return n;
    }));
    if (!rows.length) throw new Error('Empty matrix');
    const cols = rows[0].length;
    if (!cols) throw new Error('Empty row');
    rows.forEach((r, i) => {
      if (r.length !== cols) throw new Error(`Row ${i+1} has ${r.length} columns, expected ${cols}`);
    });
    return rows;
  }

  function fmtMatrix(m) {
    const cols = m[0].length;
    const colWidths = Array.from({length: cols}, (_,j) => Math.max(...m.map(r => fmt(r[j]).length)));
    return m.map(r =>
      r.map((v, j) => fmt(v).padStart(colWidths[j])).join('  ')
    ).join('\n');
  }

  function matDet(m) {
    const n = m.length;
    if (m.some(r => r.length !== n)) throw new Error('Determinant requires a square matrix');
    if (n === 1) return m[0][0];
    if (n === 2) return m[0][0]*m[1][1] - m[0][1]*m[1][0];
    let d = 0;
    for (let c = 0; c < n; c++) {
      const sub = m.slice(1).map(r => r.filter((_, j) => j !== c));
      d += (c % 2 === 0 ? 1 : -1) * m[0][c] * matDet(sub);
    }
    return d;
  }

  function matTranspose(m) {
    return m[0].map((_, j) => m.map(r => r[j]));
  }

  function matInverse(m) {
    const n = m.length;
    if (m.some(r => r.length !== n)) throw new Error('Inverse requires a square matrix');
    const d = matDet(m);
    if (Math.abs(d) < 1e-14) throw new Error('Matrix is singular (determinant ≈ 0)');
    // Gauss-Jordan
    const aug = m.map((r, i) => [...r, ...r.map((_, j) => i === j ? 1 : 0)]);
    for (let col = 0; col < n; col++) {
      let pivotRow = col;
      for (let row = col+1; row < n; row++)
        if (Math.abs(aug[row][col]) > Math.abs(aug[pivotRow][col])) pivotRow = row;
      [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
      const piv = aug[col][col];
      if (Math.abs(piv) < 1e-15) throw new Error('Matrix is singular');
      for (let j = 0; j < 2*n; j++) aug[col][j] /= piv;
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = aug[row][col];
        for (let j = 0; j < 2*n; j++) aug[row][j] -= factor * aug[col][j];
      }
    }
    return aug.map(r => r.slice(n));
  }

  function matMultiply(A, B) {
    if (A[0].length !== B.length) throw new Error(`Dimension mismatch: ${A.length}×${A[0].length} × ${B.length}×${B[0].length}`);
    return A.map(ra => B[0].map((_, j) => ra.reduce((s, v, k) => s + v * B[k][j], 0)));
  }

  function matAdd(A, B) {
    if (A.length !== B.length || A[0].length !== B[0].length)
      throw new Error('Matrices must have the same dimensions for addition');
    return A.map((r, i) => r.map((v, j) => v + B[i][j]));
  }

  function matSubtract(A, B) {
    if (A.length !== B.length || A[0].length !== B[0].length)
      throw new Error('Matrices must have the same dimensions for subtraction');
    return A.map((r, i) => r.map((v, j) => v - B[i][j]));
  }

  function matRank(m) {
    const rows = m.map(r => [...r]);
    const n = rows.length, cols = rows[0].length;
    let rank = 0;
    for (let col = 0; col < cols && rank < n; col++) {
      let pivotRow = -1;
      for (let row = rank; row < n; row++)
        if (Math.abs(rows[row][col]) > 1e-10) { pivotRow = row; break; }
      if (pivotRow === -1) continue;
      [rows[rank], rows[pivotRow]] = [rows[pivotRow], rows[rank]];
      const piv = rows[rank][col];
      for (let j = col; j < cols; j++) rows[rank][j] /= piv;
      for (let row = 0; row < n; row++) {
        if (row === rank) continue;
        const f = rows[row][col];
        for (let j = col; j < cols; j++) rows[row][j] -= f * rows[rank][j];
      }
      rank++;
    }
    return rank;
  }

  function matTrace(m) {
    const n = Math.min(m.length, m[0].length);
    let t = 0;
    for (let i = 0; i < n; i++) t += m[i][i];
    return t;
  }

  function matEigenvalues2x2(m) {
    if (m.length !== 2 || m[0].length !== 2) throw new Error('Eigenvalues currently support 2×2 matrices only');
    const tr = m[0][0] + m[1][1];
    const det = matDet(m);
    const disc = tr*tr - 4*det;
    if (disc >= 0) {
      return [`λ₁ = ${fmt((tr + Math.sqrt(disc))/2)}`, `λ₂ = ${fmt((tr - Math.sqrt(disc))/2)}`];
    }
    return [
      `λ₁ = ${fmt(tr/2)} + ${fmt(Math.sqrt(-disc)/2)}i`,
      `λ₂ = ${fmt(tr/2)} − ${fmt(Math.sqrt(-disc)/2)}i`
    ];
  }

  // Show/hide matrix B based on operation
  function updateMatBVisibility() {
    const op = $('#matOp')?.value;
    const needsB = ['add','subtract','multiply'].includes(op);
    const wrap = $('#matBWrap');
    if (wrap) wrap.style.display = needsB ? 'flex' : 'none';
  }
  $('#matOp')?.addEventListener('change', updateMatBVisibility);
  updateMatBVisibility();

  $('#runMatBtn')?.addEventListener('click', () => {
    const res = $('#matResult');
    if (!res) return;
    try {
      const A = parseMatrix($('#matA').value);
      const op = $('#matOp').value;
      let html = '';

      const matrixToHTML = (m, label = '') => {
        const pre = `<pre style="font-family:'JetBrains Mono',monospace;font-size:12.5px;line-height:1.6;color:var(--text)">${esc(fmtMatrix(m))}</pre>`;
        return label ? `<div class="result-label">${label}</div>${pre}` : pre;
      };

      if (op === 'det') {
        const d = matDet(A);
        html = `<div class="result-label">det(A)</div><div class="result-highlight">${fmt(d)}</div>`;
        historyAdd(`det(A) [${A.length}×${A[0].length}]`, fmt(d), 'Matrix');
      } else if (op === 'transpose') {
        html = matrixToHTML(matTranspose(A), 'Aᵀ');
      } else if (op === 'inverse') {
        const inv = matInverse(A);
        html = matrixToHTML(inv, 'A⁻¹');
        const d = matDet(A);
        html += `<div class="result-label" style="margin-top:8px">det(A) = ${fmt(d)}</div>`;
        historyAdd(`inv(A) [${A.length}×${A[0].length}]`, 'computed', 'Matrix');
      } else if (op === 'rank') {
        const r = matRank(A);
        html = `<div class="result-label">rank(A)</div><div class="result-highlight">${r}</div>`;
      } else if (op === 'trace') {
        const t = matTrace(A);
        html = `<div class="result-label">trace(A)</div><div class="result-highlight">${fmt(t)}</div>`;
      } else if (op === 'add') {
        const B = parseMatrix($('#matB').value);
        html = matrixToHTML(matAdd(A, B), 'A + B');
      } else if (op === 'subtract') {
        const B = parseMatrix($('#matB').value);
        html = matrixToHTML(matSubtract(A, B), 'A − B');
      } else if (op === 'multiply') {
        const B = parseMatrix($('#matB').value);
        const C = matMultiply(A, B);
        html = matrixToHTML(C, `A × B  [${A.length}×${B[0].length}]`);
        historyAdd(`A×B [${A.length}×${A[0].length}]×[${B.length}×${B[0].length}]`, 'computed', 'Matrix');
      } else if (op === 'eigen') {
        const eigs = matEigenvalues2x2(A);
        html = `<div class="result-label">Eigenvalues of A</div>` +
          eigs.map(e => `<div class="result-highlight">${esc(e)}</div>`).join('');
      }

      res.innerHTML = html;
    } catch (err) {
      res.innerHTML = `<span class="result-placeholder" style="color:#f87171">${esc('Error: ' + err.message)}</span>`;
    }
  });

  /* ═══════════════════════════════════════════
     UNIT CONVERTER
  ═══════════════════════════════════════════ */
  const UNITS = {
    Length:      { m:1, cm:0.01, mm:0.001, km:1000, in:0.0254, ft:0.3048, yd:0.9144, mi:1609.344, 'nmi':1852, ly:9.461e15 },
    Mass:        { kg:1, g:0.001, mg:1e-6, t:1000, lb:0.45359237, oz:0.028349523125, 'st':6.35029318, carat:0.0002 },
    Temperature: '__special__',
    Speed:       { 'm/s':1, 'km/h':1/3.6, mph:0.44704, knot:0.514444, 'ft/s':0.3048, 'mach':340.29 },
    Time:        { s:1, ms:0.001, μs:1e-6, ns:1e-9, min:60, h:3600, day:86400, week:604800, month:2629800, year:31557600 },
    'Area':      { 'm²':1, 'cm²':1e-4, 'mm²':1e-6, 'km²':1e6, 'ft²':0.09290304, 'in²':0.00064516, acre:4046.8564, ha:10000 },
    Volume:      { 'm³':1, 'cm³':1e-6, L:0.001, mL:1e-6, 'ft³':0.028316847, 'in³':1.6387064e-5, gal:0.003785412, qt:9.46353e-4, pt:4.73176e-4, fl_oz:2.95735e-5 },
    Pressure:    { Pa:1, kPa:1000, MPa:1e6, bar:1e5, psi:6894.757, atm:101325, mmHg:133.322, torr:133.322 },
    Energy:      { J:1, kJ:1000, MJ:1e6, cal:4.184, kcal:4184, Wh:3600, kWh:3600000, eV:1.602176634e-19, BTU:1055.056 },
    Power:       { W:1, kW:1000, MW:1e6, hp:745.69987, 'BTU/h':0.29307107 },
    Data:        { bit:1, B:8, kB:8000, MB:8e6, GB:8e9, TB:8e12, KiB:8192, MiB:8388608, GiB:8589934592, TiB:8796093022208 },
    Angle:       { deg:1, rad:180/Math.PI, grad:0.9, arcmin:1/60, arcsec:1/3600 },
    Force:       { N:1, kN:1000, lbf:4.44822, kgf:9.80665, dyn:1e-5 },
    Frequency:   { Hz:1, kHz:1000, MHz:1e6, GHz:1e9, 'rpm':1/60 },
  };

  function tempConvert(val, from, to) {
    // All convert through Celsius
    const toC = { C: v => v, F: v => (v-32)*5/9, K: v => v-273.15, R: v => (v-491.67)*5/9 };
    const fromC = { C: v => v, F: v => v*9/5+32, K: v => v+273.15, R: v => (v+273.15)*9/5 };
    const inC = (toC[from] || (v=>v))(val);
    return (fromC[to] || (v=>v))(inC);
  }

  function fillConvCategories() {
    const sel = $('#convCategory');
    if (!sel) return;
    sel.innerHTML = Object.keys(UNITS).map(k => `<option>${esc(k)}</option>`).join('');
    fillConvUnits();
  }

  function fillConvUnits() {
    const cat = $('#convCategory')?.value;
    const fromSel = $('#convFromUnit');
    const toSel   = $('#convToUnit');
    if (!cat || !fromSel || !toSel) return;
    const isTemp = UNITS[cat] === '__special__';
    const keys = isTemp ? ['C','F','K','R'] : Object.keys(UNITS[cat]);
    const opts = keys.map(k => `<option>${esc(k)}</option>`).join('');
    fromSel.innerHTML = opts;
    toSel.innerHTML   = opts;
    if (keys.length > 1) toSel.selectedIndex = 1;
  }

  function runConversion() {
    const cat  = $('#convCategory')?.value;
    const val  = Number($('#convFrom').value);
    const from = $('#convFromUnit')?.value;
    const to   = $('#convToUnit')?.value;
    const resCard = $('#convResult');
    if (!cat || isNaN(val) || !from || !to || !resCard) return;

    try {
      let result;
      if (UNITS[cat] === '__special__') {
        result = tempConvert(val, from, to);
      } else {
        const table = UNITS[cat];
        if (!table[from]) throw new Error(`Unknown unit: ${from}`);
        if (!table[to])   throw new Error(`Unknown unit: ${to}`);
        result = val * table[from] / table[to];
      }
      $('#convTo').value = fmt(result, 10);
      resCard.innerHTML = `
        <div class="result-label">Conversion result</div>
        <div class="result-highlight">${fmt(val, 8)} ${esc(from)} = <span style="color:var(--orange-2)">${fmt(result, 8)} ${esc(to)}</span></div>`;
      historyAdd(`${fmt(val)} ${from} → ${to}`, `${fmt(result)} ${to}`, 'Converter');
    } catch (err) {
      resCard.innerHTML = `<span class="result-placeholder" style="color:#f87171">${esc(err.message)}</span>`;
    }
  }

  $('#convCategory')?.addEventListener('change', fillConvUnits);
  $('#convFromUnit')?.addEventListener('change', runConversion);
  $('#convToUnit')?.addEventListener('change', runConversion);
  $('#convFrom')?.addEventListener('input', runConversion);
  $('#runConvBtn')?.addEventListener('click', runConversion);
  $('#convSwapBtn')?.addEventListener('click', () => {
    const fromSel = $('#convFromUnit');
    const toSel   = $('#convToUnit');
    const fromInput = $('#convFrom');
    const toOutput = $('#convTo');
    if (!fromSel || !toSel || !fromInput || !toOutput) return;
    
    // Swap unit selectors
    const tmp = fromSel.value;
    fromSel.value = toSel.value;
    toSel.value = tmp;
    
    // Transfer converted value to input
    const convertedText = toOutput.textContent?.trim();
    if (convertedText && !convertedText.includes('Enter')) {
      fromInput.value = convertedText.replace(/[^\d.-]/g, '');
    }
    
    runConversion();
  });

  fillConvCategories();

  /* ═══════════════════════════════════════════
     PHYSICS CALCULATOR
  ═══════════════════════════════════════════ */
  const PHYSICS_FORMULAS = [
    {
      name: "Newton's Second Law",
      eq: 'F = ma',
      fields: [
        { label: 'Mass m', unit: 'kg', id: 'mass' },
        { label: 'Acceleration a', unit: 'm/s²', id: 'accel' },
      ],
      compute: v => ({ result: v.mass * v.accel, unit: 'N', label: 'Force F' }),
    },
    {
      name: 'Kinetic Energy',
      eq: 'KE = ½mv²',
      fields: [
        { label: 'Mass m', unit: 'kg', id: 'mass', default: 5 },
        { label: 'Velocity v', unit: 'm/s', id: 'vel', default: 10 },
      ],
      compute: v => ({ result: 0.5 * v.mass * v.vel**2, unit: 'J', label: 'Kinetic Energy KE' }),
    },
    {
      name: 'Gravitational PE',
      eq: 'PE = mgh',
      fields: [
        { label: 'Mass m', unit: 'kg', id: 'mass' },
        { label: 'Height h', unit: 'm', id: 'height', default: 10 },
        { label: 'g', unit: 'm/s²', id: 'g', default: 9.80665 },
      ],
      compute: v => ({ result: v.mass * v.g * v.height, unit: 'J', label: 'Potential Energy PE' }),
    },
    {
      name: "Ohm's Law",
      eq: 'V = IR',
      fields: [
        { label: 'Current I', unit: 'A', id: 'current', default: 2 },
        { label: 'Resistance R', unit: 'Ω', id: 'resist', default: 10 },
      ],
      compute: v => ({ result: v.current * v.resist, unit: 'V', label: 'Voltage V' }),
    },
    {
      name: 'Electric Power',
      eq: 'P = IV',
      fields: [
        { label: 'Current I', unit: 'A', id: 'current', default: 3 },
        { label: 'Voltage V', unit: 'V', id: 'volt', default: 12 },
      ],
      compute: v => ({ result: v.current * v.volt, unit: 'W', label: 'Power P' }),
    },
    {
      name: 'Density',
      eq: 'ρ = m/V',
      fields: [
        { label: 'Mass m', unit: 'kg', id: 'mass' },
        { label: 'Volume V', unit: 'm³', id: 'vol', default: 0.5 },
      ],
      compute: v => {
        if (v.vol === 0) throw new Error('Volume cannot be zero');
        return { result: v.mass / v.vol, unit: 'kg/m³', label: 'Density ρ' };
      },
    },
    {
      name: 'Wave Speed',
      eq: 'v = fλ',
      fields: [
        { label: 'Frequency f', unit: 'Hz', id: 'freq', default: 440 },
        { label: 'Wavelength λ', unit: 'm', id: 'wavelength', default: 0.773 },
      ],
      compute: v => ({ result: v.freq * v.wavelength, unit: 'm/s', label: 'Wave Speed v' }),
    },
    {
      name: 'Projectile Range',
      eq: 'R = v₀²sin(2θ)/g',
      fields: [
        { label: 'Initial speed v₀', unit: 'm/s', id: 'v0', default: 20 },
        { label: 'Angle θ', unit: state.angle === 'DEG' ? '°' : 'rad', id: 'theta', default: 45 },
        { label: 'g', unit: 'm/s²', id: 'g', default: 9.80665 },
      ],
      compute: v => {
        const angle = state.angle === 'DEG' ? v.theta * Math.PI / 180 : v.theta;
        return { result: v.v0**2 * Math.sin(2*angle) / v.g, unit: 'm', label: 'Range R' };
      },
    },
    {
      name: 'Coulomb\'s Law',
      eq: 'F = kq₁q₂/r²',
      fields: [
        { label: 'Charge q₁', unit: 'C', id: 'q1', default: 1e-6 },
        { label: 'Charge q₂', unit: 'C', id: 'q2', default: 1e-6 },
        { label: 'Distance r', unit: 'm', id: 'r', default: 0.1 },
      ],
      compute: v => {
        if (v.r === 0) throw new Error('Distance cannot be zero');
        return { result: 8.9875517923e9 * v.q1 * v.q2 / (v.r**2), unit: 'N', label: 'Force F' };
      },
    },
    {
      name: 'Ideal Gas Law',
      eq: 'PV = nRT',
      fields: [
        { label: 'n (moles)', unit: 'mol', id: 'n', default: 1 },
        { label: 'Temperature T', unit: 'K', id: 'T', default: 293.15 },
        { label: 'Volume V', unit: 'm³', id: 'V', default: 0.0245 },
      ],
      compute: v => {
        if (v.V === 0) throw new Error('Volume cannot be zero');
        return { result: v.n * 8.314462618 * v.T / v.V, unit: 'Pa', label: 'Pressure P' };
      },
    },
    {
      name: 'Gravitational Force',
      eq: 'F = Gm₁m₂/r²',
      fields: [
        { label: 'Mass m₁', unit: 'kg', id: 'm1', default: 5.972e24 },
        { label: 'Mass m₂', unit: 'kg', id: 'm2', default: 70 },
        { label: 'Distance r', unit: 'm', id: 'r', default: 6.371e6 },
      ],
      compute: v => {
        if (v.r === 0) throw new Error('Distance cannot be zero');
        return { result: 6.67430e-11 * v.m1 * v.m2 / (v.r**2), unit: 'N', label: 'Gravitational Force F' };
      },
    },
    {
      name: 'Momentum',
      eq: 'p = mv',
      fields: [
        { label: 'Mass m', unit: 'kg', id: 'mass' },
        { label: 'Velocity v', unit: 'm/s', id: 'vel', default: 5 },
      ],
      compute: v => ({ result: v.mass * v.vel, unit: 'kg·m/s', label: 'Momentum p' }),
    },
  ];

  function renderPhysicsPanel() {
    const grid = $('#physicsFormulaGrid');
    if (!grid) return;
    grid.innerHTML = PHYSICS_FORMULAS.map((formula, fi) => `
      <div class="physics-card" id="phys-card-${fi}">
        <div class="physics-card-header">
          <div>
            <div class="physics-formula-name">${esc(formula.name)}</div>
            <div class="physics-formula-eq">${esc(formula.eq)}</div>
          </div>
        </div>
        <div class="physics-fields">
          ${formula.fields.map(field => `
            <div class="physics-field-row">
              <label>${esc(field.label)}</label>
              <input type="number" step="any" value="${field.default ?? 1}" data-fi="${fi}" data-fid="${esc(field.id)}" />
              <span class="field-unit">${esc(field.unit)}</span>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
          <div class="physics-result" id="phys-result-${fi}"></div>
          <button class="physics-calc-btn" data-fi="${fi}">Calculate</button>
        </div>
      </div>
    `).join('');

    $$('.physics-calc-btn', grid).forEach(btn => {
      btn.addEventListener('click', () => {
        const fi = Number(btn.dataset.fi);
        const formula = PHYSICS_FORMULAS[fi];
        const resEl = $(`#phys-result-${fi}`);
        if (!formula || !resEl) return;
        try {
          const vals = {};
          $$(`input[data-fi="${fi}"]`, grid).forEach(inp => {
            vals[inp.dataset.fid] = Number(inp.value);
          });
          const { result, unit, label } = formula.compute(vals);
          resEl.textContent = `${label} = ${fmt(result)} ${unit}`;
          historyAdd(`${formula.name}: ${formula.eq}`, `${fmt(result)} ${unit}`, 'Physics');
        } catch (err) {
          resEl.textContent = 'Error: ' + err.message;
          resEl.style.color = '#f87171';
        }
      });
    });
  }

  renderPhysicsPanel();

  /* ═══════════════════════════════════════════
     MODULE SELECTOR (topbar dropdown)
  ═══════════════════════════════════════════ */
  $('#moduleSelector')?.addEventListener('click', () => {
    // Open a quick panel list
    const existing = $('#moduleSelectorDropdown');
    if (existing) { existing.remove(); return; }
    const rect = $('#moduleSelector').getBoundingClientRect();
    const drop = document.createElement('div');
    drop.id = 'moduleSelectorDropdown';
    drop.style.cssText = `
      position:fixed;top:${rect.bottom+6}px;left:${rect.left}px;
      background:var(--surface-raised);border:1px solid var(--border-bright);
      border-radius:var(--radius-lg);box-shadow:var(--shadow);z-index:200;
      padding:6px;min-width:200px;animation:slideUp 0.18s ease`;
    drop.innerHTML = Object.entries(panelLabels).map(([id, label]) => `
      <button class="nav-btn" data-panel="${id}" style="height:38px;width:100%">${esc(label)}</button>
    `).join('');
    document.body.appendChild(drop);
    $$('.nav-btn[data-panel]', drop).forEach(btn => {
      btn.addEventListener('click', () => {
        switchPanel(btn.dataset.panel);
        drop.remove();
      });
    });
    const closeOnOutside = e => {
      if (!drop.contains(e.target)) { drop.remove(); document.removeEventListener('click', closeOnOutside); }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 10);
  });

  /* ═══════════════════════════════════════════
     INITIAL STATE SETUP
  ═══════════════════════════════════════════ */
  // Apply saved precision to settings UI
  if ($('#settingPrecision')) $('#settingPrecision').value = String(state.precision);
  if ($('#settingSciNotation')) $('#settingSciNotation').checked = state.sciNotation;
  if (state.angle === 'RAD') {
    $('#radBtn')?.classList.add('active');
    $('#degBtn')?.classList.remove('active');
  }

  // Activate scientific panel
  switchPanel('scientific');
  updateDisplay();

  /* ═══════════════════════════════════════════
     RESIZE / VISIBILITY HANDLERS
  ═══════════════════════════════════════════ */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if ($('#panel-graphing')?.classList.contains('active')) drawGraph();
      if ($('#panel-statistics')?.classList.contains('active')) drawStatsChart();
    }, 150);
  });

  // Re-draw when switching to graph/stats panel
  $$('.nav-btn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.panel === 'graphing') setTimeout(drawGraph, 100);
      if (btn.dataset.panel === 'statistics') setTimeout(drawStatsChart, 100);
    });
  });

  /* ═══════════════════════════════════════════
     KEYBOARD SHORTCUTS (global)
  ═══════════════════════════════════════════ */
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    // Ctrl/Cmd+H → history
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') { e.preventDefault(); openHistory(); }
    // Ctrl/Cmd+, → settings
    if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); openSettings(); }
    // Escape → close modals
    if (e.key === 'Escape') {
      closeHistory(); closeSettings(); closeVarsModal();
      const drop = $('#moduleSelectorDropdown');
      if (drop) drop.remove();
    }
    // 1-8 → switch panels
    const panelKeys = ['1','2','3','4','5','6','7','8'];
    const panels = ['scientific','graphing','solver','calculus','statistics','matrix','converter','physics'];
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const idx = panelKeys.indexOf(e.key);
      if (idx !== -1 && !e.target.matches('input,textarea,select')) {
        switchPanel(panels[idx]);
      }
    }
  });

  /* ═══════════════════════════════════════════
     MODULE SELECTOR ICON (topbar)
  ═══════════════════════════════════════════ */
  $$('.nav-btn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.panel;
      const icons = {
        scientific: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>`,
        graphing:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
        solver:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/></svg>`,
        calculus:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 20c0-4 2-6 6-6s6 2 6 6"/></svg>`,
        statistics: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
        matrix:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
        converter:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M7 23l-4-4 4-4"/></svg>`,
        physics:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>`,
      };
      const el = $('#moduleSelectorIcon');
      if (el && icons[id]) el.innerHTML = icons[id];
    });
  });

  /* ═══════════════════════════════════════════
     MOBILE TAB BAR
  ═══════════════════════════════════════════ */
  $$('.mobile-tab-btn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchPanel(btn.dataset.panel);
    });
  });

  /* ═══════════════════════════════════════════
     MOBILE BOTTOM NAV
  ═══════════════════════════════════════════ */
  // Home → scientific
  $('#mobileNavHome')?.addEventListener('click', () => {
    switchPanel('scientific');
    $$('.mobile-nav-item').forEach(b => b.classList.remove('active'));
    $('#mobileNavHome')?.classList.add('active');
  });

  // Tools → opens a quick-pick overlay of all non-calc panels
  $('#mobileNavTools')?.addEventListener('click', () => {
    // Toggle a mini panel picker
    const existing = $('#mobileToolsPicker');
    if (existing) { existing.remove(); return; }

    const toolPanels = [
      { id: 'graphing',   icon: '⌁', label: 'Graphing' },
      { id: 'solver',     icon: 'ƒ', label: 'Solver' },
      { id: 'calculus',   icon: '∫', label: 'Calculus' },
      { id: 'statistics', icon: 'μ', label: 'Statistics' },
      { id: 'matrix',     icon: '▦', label: 'Matrix' },
      { id: 'converter',  icon: '⇄', label: 'Converter' },
      { id: 'physics',    icon: '⚛', label: 'Physics' },
    ];

    const picker = document.createElement('div');
    picker.id = 'mobileToolsPicker';
    picker.style.cssText = `
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      width:calc(100vw - 24px);max-width:360px;
      background:rgba(6,5,16,0.88);
      backdrop-filter:blur(32px) saturate(180%);
      -webkit-backdrop-filter:blur(32px) saturate(180%);
      border:1px solid rgba(255,255,255,0.12);
      border-radius:20px;padding:14px;
      display:grid;grid-template-columns:repeat(4,1fr);gap:8px;
      box-shadow:0 20px 60px rgba(0,0,0,0.60),inset 0 1px 0 rgba(255,255,255,0.08);
      z-index:200;
      animation:slideUp 0.20s ease`;

    picker.innerHTML = toolPanels.map(t => `
      <button data-pick="${t.id}" style="
        display:flex;flex-direction:column;align-items:center;gap:5px;
        padding:10px 6px;border-radius:12px;
        background:rgba(255,255,255,0.045);
        border:1px solid rgba(255,255,255,0.09);
        color:var(--text-2);font-size:11px;font-weight:600;
        transition:all 0.15s;">
        <span style="font-size:18px;">${t.icon}</span>
        ${t.label}
      </button>`).join('');

    document.body.appendChild(picker);

    $$('[data-pick]', picker).forEach(btn => {
      btn.addEventListener('pointerenter', () => {
        btn.style.background = 'rgba(139,92,246,0.18)';
        btn.style.borderColor = 'rgba(139,92,246,0.35)';
        btn.style.color = 'var(--text-accent)';
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.background = 'rgba(255,255,255,0.045)';
        btn.style.borderColor = 'rgba(255,255,255,0.09)';
        btn.style.color = 'var(--text-2)';
      });
      btn.addEventListener('click', () => {
        switchPanel(btn.dataset.pick);
        picker.remove();
        $$('.mobile-nav-item').forEach(b => b.classList.remove('active'));
        $('#mobileNavTools')?.classList.add('active');
      });
    });

    // Close on outside tap
    setTimeout(() => {
      const closeOutside = e => {
        if (!picker.contains(e.target) && e.target !== $('#mobileNavTools')) {
          picker.remove();
          document.removeEventListener('pointerdown', closeOutside);
        }
      };
      document.addEventListener('pointerdown', closeOutside);
    }, 50);
  });

  // Center button — quick-calculate / bounce animation
  $('#mobileNavCenter')?.addEventListener('click', () => {
    // Scroll scientific panel into view and focus it
    switchPanel('scientific');
    $$('.mobile-nav-item').forEach(b => b.classList.remove('active'));
    $('#mobileNavHome')?.classList.add('active');
    // Pulse the display
    const disp = $('#displayResult');
    if (disp) {
      disp.style.transition = 'transform 0.15s, color 0.15s';
      disp.style.transform = 'scale(1.04)';
      disp.style.color = 'var(--purple-2)';
      setTimeout(() => {
        disp.style.transform = '';
        disp.style.color = '';
      }, 300);
    }
  });

  // History (bottom nav)
  $('#mobileNavHistory')?.addEventListener('click', () => {
    openHistory();
    $$('.mobile-nav-item').forEach(b => b.classList.remove('active'));
    $('#mobileNavHistory')?.classList.add('active');
  });

  // Settings (bottom nav)
  $('#mobileNavSettings')?.addEventListener('click', () => {
    openSettings();
    $$('.mobile-nav-item').forEach(b => b.classList.remove('active'));
    $('#mobileNavSettings')?.classList.add('active');
  });

  // Restore home active state when history/settings close
  const _closeHistoryOrig = closeHistory;
  closeHistory = () => {
    _closeHistoryOrig();
    if (window.innerWidth <= 680) {
      $$('.mobile-nav-item').forEach(b => b.classList.remove('active'));
      const activePanel = $('.panel.active')?.id?.replace('panel-', '') || 'scientific';
      if (activePanel === 'scientific') $('#mobileNavHome')?.classList.add('active');
      else $('#mobileNavTools')?.classList.add('active');
    }
  };

  /* ═══════════════════════════════════════════
     MOBILE ANGLE TOGGLE (topbar Deg button)
  ═══════════════════════════════════════════ */
  $('#degBtn2')?.addEventListener('click', () => {
    // Toggle DEG/RAD
    if (state.angle === 'DEG') {
      state.angle = 'RAD';
      $('#degBtn2').textContent = 'Rad';
      $('#degBtn2').classList.remove('active');
      $('#radBtn')?.classList.add('active');
      $('#degBtn')?.classList.remove('active');
      $('#settingRad')?.classList.add('active');
      $('#settingDeg')?.classList.remove('active');
    } else {
      state.angle = 'DEG';
      $('#degBtn2').textContent = 'Deg';
      $('#degBtn2').classList.add('active');
      $('#degBtn')?.classList.add('active');
      $('#radBtn')?.classList.remove('active');
      $('#settingDeg')?.classList.add('active');
      $('#settingRad')?.classList.remove('active');
    }
    saveState();
  });

  /* ═══════════════════════════════════════════
     MOBILE THEME BUTTON (moon icon in topbar)
  ═══════════════════════════════════════════ */
  $('#mobileThemeBtn')?.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    // Update moon icon fill
    const moonBtn = $('#mobileThemeBtn');
    if (moonBtn) {
      moonBtn.style.color = state.theme === 'dark' ? 'var(--text-2)' : 'var(--orange-2)';
    }
  });

  /* ═══════════════════════════════════════════
     MOBILE GRAPH PREVIEW (mini canvas below keypad)
  ═══════════════════════════════════════════ */
  function drawMobileGraphPreview() {
    const canvas = /** @type {HTMLCanvasElement|null} */ ($('#mobileGraphCanvas'));
    if (!canvas || !canvas.offsetParent) return; // only draw when visible

    const ctx = canvas.getContext('2d');
    const wrap = canvas.parentElement;
    const W = wrap.offsetWidth - 28; // account for padding
    const H = 100;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.max(W, 10) * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Dark glass background
    ctx.fillStyle = 'rgba(4,3,12,0)'; // transparent — glass shows through
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;
    const s  = W / (4 * Math.PI); // scale so we see ~2 cycles

    // Grid — subtle
    ctx.strokeStyle = 'rgba(100,110,180,0.10)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += s * Math.PI) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += H / 4) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // X axis
    ctx.strokeStyle = 'rgba(140,150,220,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

    // X-axis labels
    ctx.fillStyle = 'rgba(100,110,180,0.55)';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    const labelMap = { [-2]: '−2π', [-1]: '−π', 0: '0', 1: 'π', 2: '2π' };
    for (let n = -2; n <= 2; n++) {
      const px = cx + n * Math.PI * s;
      if (px >= 0 && px <= W) ctx.fillText(labelMap[n] || '', px, H - 2);
    }

    // sin(x) — purple
    const plotFn = (fn, color) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      let started = false;
      for (let px = 0; px <= W; px++) {
        const xVal = (px - cx) / s;
        const yVal = fn(xVal);
        const py = cy - yVal * (H / 2 - 8);
        if (!isFinite(py) || Math.abs(py) > H * 10) { started = false; continue; }
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };

    plotFn(x => Math.sin(x), '#a78bfa');
    plotFn(x => Math.cos(x), '#fb923c');
  }

  // "View All →" button on mini graph
  $('#mobileGraphViewAllBtn')?.addEventListener('click', () => {
    switchPanel('graphing');
    $$('.mobile-nav-item').forEach(b => b.classList.remove('active'));
    $('#mobileNavTools')?.classList.add('active');
  });

  // Mini card click handlers
  $('#miniSolverCard')?.addEventListener('click', () => switchPanel('solver'));
  $('#miniSolverCard')?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') switchPanel('solver'); });
  $('#miniConverterCard')?.addEventListener('click', () => switchPanel('converter'));
  $('#miniConverterCard')?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') switchPanel('converter'); });

  // Mobile history clear button
  $('#mobileHistoryClearBtn')?.addEventListener('click', () => {
    state.history = [];
    saveState();
    renderHistoryList();
    renderSciHistory();
    updateHistoryBadge();
    renderMobileHistory();
    showToast('History cleared');
  });

  /* ─── Render mobile history entries ─── */
  function renderMobileHistory() {
    const container = $('#mobileHistoryEntries');
    if (!container) return;
    const items = state.history.slice(0, 4); // show last 4 on mobile
    if (!items.length) {
      container.innerHTML = '<div class="mobile-history-entry" style="color:var(--text-3);">No calculations yet</div>';
      return;
    }
    container.innerHTML = items.map(h => `
      <div class="mobile-history-entry">
        <span style="color:var(--text-3);font-size:11px;">${esc(h.expr)}</span>
        <span style="color:var(--text);"> = ${esc(h.result)}</span>
        <span style="color:var(--text-3);font-size:10px;margin-left:6px;">${new Date(h.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
      </div>
    `).join('');
  }

  /* ─── Hook mobile history render into historyAdd ─── */
  const _origHistoryAdd = historyAdd;
  // Patch: re-render mobile history whenever history is updated
  // We do this by overriding renderSciHistory to also call renderMobileHistory
  const _origRenderSciHistory = renderSciHistory;
  function renderSciHistoryPatched() {
    _origRenderSciHistory();
    renderMobileHistory();
  }
  // Replace global reference used by historyAdd
  // Since renderSciHistory is called inside historyAdd, re-bind by wrapping historyAdd:
  function historyAddPatched(expr, result, module = 'Scientific') {
    state.history.unshift({ expr, result, module, time: Date.now() });
    state.history = state.history.slice(0, 300);
    saveState();
    // render desktop history
    const list = $('#sciHistoryList');
    if (list) {
      const items = state.history.slice(0, 20);
      if (!items.length) {
        list.innerHTML = '<div class="history-empty">No calculations yet</div>';
      } else {
        list.innerHTML = items.map((h, i) => `
          <button class="history-mini-item" data-idx="${i}">
            <div class="h-expr">${esc(h.expr)}</div>
            <div class="h-result">= ${esc(h.result)}</div>
          </button>
        `).join('');
        $$('.history-mini-item', list).forEach(btn => {
          btn.addEventListener('click', () => {
            const hx = state.history[Number(btn.dataset.idx)];
            if (!hx) return;
            state.expression = hx.expr;
            state.justCalc = false;
            $('#displayExpression').textContent = '';
            updateDisplay();
          });
        });
      }
    }
    renderHistoryList();
    updateHistoryBadge();
    renderMobileHistory();
  }

  // Override the calc button wiring to use patched historyAdd:
  // We can't easily reassign the closed-over `historyAdd`, so instead
  // we patch all call sites by monkey-patching the calculate + unary functions
  // The simplest safe approach: listen for history changes via MutationObserver
  const histObserver = new MutationObserver(() => renderMobileHistory());
  const sciHistList = $('#sciHistoryList');
  if (sciHistList) histObserver.observe(sciHistList, { childList: true, subtree: true });

  /* ═══════════════════════════════════════════
     MOBILE CSS HELPERS — dynamic classes
  ═══════════════════════════════════════════ */
  // Add desktop-only display:none for elements that should hide on mobile
  function injectMobileCSS() {
    const style = document.createElement('style');
    style.textContent = `
      @media (max-width: 680px) {
        .desktop-only { display: none !important; }
        .mobile-brand { display: flex !important; }
        .mobile-angle-group { display: flex !important; }
        .mobile-theme-btn { display: grid !important; }
      }
      @media (min-width: 681px) {
        .mobile-brand { display: none !important; }
        .mobile-angle-group { display: none !important; }
        .mobile-theme-btn { display: none !important; }
        .mobile-tab-bar { display: none !important; }
        .mobile-bottom-nav { display: none !important; }
        .mobile-graph-preview { display: none !important; }
        .mobile-mini-cards { display: none !important; }
        .mobile-history-card { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }
  injectMobileCSS();

  /* ═══════════════════════════════════════════
     RESIZE HANDLER — redraw on orientation change
  ═══════════════════════════════════════════ */
  window.addEventListener('resize', () => {
    if ($('#panel-graphing')?.classList.contains('active')) drawGraph();
    if ($('#panel-statistics')?.classList.contains('active')) drawStatsChart();
    // Redraw mobile preview if visible
    if (window.innerWidth <= 680) {
      setTimeout(drawMobileGraphPreview, 100);
    }
  });

  // Redraw on panel switch
  $$('.nav-btn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.panel;
      if (id === 'graphing') setTimeout(drawGraph, 100);
      if (id === 'statistics') setTimeout(drawStatsChart, 100);
    });
  });

  /* ═══════════════════════════════════════════
     INITIAL MOBILE SETUP
  ═══════════════════════════════════════════ */
  // Draw mini graph after a short delay (let layout settle)
  setTimeout(() => {
    if (window.innerWidth <= 680) drawMobileGraphPreview();
  }, 400);

  // Sync mobile deg button with saved state
  if (state.angle === 'RAD') {
    if ($('#degBtn2')) $('#degBtn2').textContent = 'Rad';
    $('#degBtn2')?.classList.remove('active');
  }

  // Set initial bottom nav active state
  $('#mobileNavHome')?.classList.add('active');

  /* ═══════════════════════════════════════════
     KEYBOARD SHORTCUTS (global)
  ═══════════════════════════════════════════ */
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') { e.preventDefault(); openHistory(); }
    if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); openSettings(); }
    if (e.key === 'Escape') {
      closeHistory(); closeSettings(); closeVarsModal();
      const drop = $('#moduleSelectorDropdown');
      if (drop) drop.remove();
      const picker = $('#mobileToolsPicker');
      if (picker) picker.remove();
    }
    const panelKeys = ['1','2','3','4','5','6','7','8'];
    const panels = ['scientific','graphing','solver','calculus','statistics','matrix','converter','physics'];
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const idx = panelKeys.indexOf(e.key);
      if (idx !== -1 && !e.target.matches('input,textarea,select')) {
        switchPanel(panels[idx]);
      }
    }
  });

  // Log
  console.log('%cNEXUS Scientific Calculator ready', 'color:#a78bfa;font-weight:bold;font-size:14px');
  console.log('%cGlassmorphism edition — no eval() used', 'color:#34d399;font-size:11px');

})();
