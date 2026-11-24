(() => {
  "use strict";
  const $ = (q, r = document) => r.querySelector(q),
    $$ = (q, r = document) => [...r.querySelectorAll(q)];
  const state = {
    expression: "0",
    reset: false,
    angle: "DEG",
    memory: 0,
    answer: 0,
    precision: 12,
    variables: {},
    history: [],
    theme: localStorage.getItem("nova-theme") || "dark",
    equations: ["sin(x)"],
    scale: 45,
    offsetX: 0,
    offsetY: 0,
  };
  try {
    state.history = JSON.parse(localStorage.getItem("nova-history") || "[]");
    state.variables = JSON.parse(
      localStorage.getItem("nova-variables") || "{}",
    );
    state.precision = Number(localStorage.getItem("nova-precision") || 12);
  } catch (e) {}
  const display = $("#display"),
    preview = $("#historyPreview");

  $$(".nav-item[data-module]").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".nav-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $$(".module-panel").forEach((panel) => panel.classList.remove("active"));
      const panel = $("#" + button.dataset.module + "-panel");
      if (panel) panel.classList.add("active");
      $("#moduleTitle").textContent =
        button.querySelector("b")?.textContent || button.textContent.trim();
      $(".sidebar")?.classList.remove("open");
    });
  });

  function esc(v) {
    return String(v).replace(
      /[&<>'"]/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[c],
    );
  }
  function fmt(v) {
    if (!Number.isFinite(v)) throw Error("Result is not finite");
    if (Object.is(v, -0)) v = 0;
    const a = Math.abs(v);
    if ((a > 0 && a < 1e-9) || a >= 1e12)
      return v
        .toExponential(Math.min(state.precision, 12))
        .replace(/\.?(0+)e/, "e");
    return parseFloat(v.toPrecision(state.precision)).toString();
  }
  function toast(v) {
    let e = $("#toast");
    if (!e) {
      e = document.createElement("div");
      e.id = "toast";
      e.className = "toast";
      document.body.append(e);
    }
    e.textContent = v;
    e.classList.add("show");
    setTimeout(() => e.classList.remove("show"), 2300);
  }
  function update() {
    display.value = state.expression;
    $("#memoryIndicator").textContent = `MEM ${fmt(state.memory)}`;
  }
  function append(v) {
    if (state.reset) {
      state.expression = "0";
      state.reset = false;
    }
    state.expression = state.expression === "0" ? v : state.expression + v;
    update();
  }
  function operator(v) {
    if (state.reset) {
      state.reset = false;
    }
    state.expression = state.expression === "Error" ? "0" : state.expression;
    if (/[+−×÷^]$/.test(state.expression))
      state.expression = state.expression.slice(0, -1);
    state.expression += v;
    update();
  }
  function clear() {
    state.expression = "0";
    preview.textContent = "";
    state.reset = false;
    update();
  }
  function back() {
    if (state.reset) {
      clear();
      return;
    }
    state.expression =
      state.expression.length > 1 ? state.expression.slice(0, -1) : "0";
    update();
  }
  function factorial(n) {
    if (!Number.isInteger(n) || n < 0 || n > 170)
      throw Error("Factorial requires an integer 0–170");
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }
  function npr(n, r) {
    if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || r > n)
      throw Error("Invalid permutation");
    return factorial(n) / factorial(n - r);
  }
  function ncr(n, r) {
    if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || r > n)
      throw Error("Invalid combination");
    return factorial(n) / (factorial(r) * factorial(n - r));
  }

  class Parser {
    constructor(t) {
      this.t = t
        .replace(/π/g, "pi")
        .replace(/−/g, "-")
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/Ans/g, "__answer")
        .replace(/([0-9)])\s*(pi|e|__answer|[a-zA-Z])/g, "$1*$2");
      this.i = 0;
    }
    peek() {
      return this.t[this.i] || "";
    }
    skip() {
      while (/\s/.test(this.peek())) this.i++;
    }
    take(re) {
      this.skip();
      const m = this.t.slice(this.i).match(re);
      if (!m) return null;
      this.i += m[0].length;
      return m[0];
    }
    parse() {
      const v = this.expr();
      this.skip();
      if (this.i !== this.t.length)
        throw Error(`Unexpected symbol at position ${this.i + 1}`);
      return v;
    }
    expr() {
      let v = this.term();
      for (;;) {
        this.skip();
        if (this.peek() === "+") {
          this.i++;
          v += this.term();
        } else if (this.peek() === "-") {
          this.i++;
          v -= this.term();
        } else return v;
      }
    }
    term() {
      let v = this.unary();
      for (;;) {
        this.skip();
        if (this.peek() === "*") {
          this.i++;
          v *= this.unary();
        } else if (this.peek() === "/") {
          this.i++;
          const d = this.unary();
          if (d === 0) throw Error("Division by zero");
          v /= d;
        } else if (this.t.startsWith("mod", this.i)) {
          this.i += 3;
          v %= this.unary();
        } else return v;
      }
    }
    unary() {
      this.skip();
      if (this.peek() === "+") {
        this.i++;
        return this.unary();
      }
      if (this.peek() === "-") {
        this.i++;
        return -this.unary();
      }
      return this.power();
    }
    power() {
      let v = this.primary();
      this.skip();
      if (this.peek() === "^") {
        this.i++;
        v = v ** this.unary();
      }
      return v;
    }
    primary() {
      this.skip();
      if (this.peek() === "(") {
        this.i++;
        const v = this.expr();
        this.skip();
        if (this.peek() !== ")") throw Error("Missing closing parenthesis");
        this.i++;
        return v;
      }
      const num = this.take(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
      if (num) return Number(num);
      const name = this.take(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (!name) throw Error("Invalid expression");
      const args = () => {
        this.skip();
        if (this.peek() !== "(") return [this.primary()];
        this.i++;
        const a = [];
        if (this.peek() !== ")")
          do {
            a.push(this.expr());
            this.skip();
            if (this.peek() === ",") {
              this.i++;
              continue;
            }
            break;
          } while (true);
        if (this.peek() !== ")") throw Error("Missing closing parenthesis");
        this.i++;
        return a;
      };
      if (name === "pi") return Math.PI;
      if (name === "e") return Math.E;
      if (name === "__answer") return state.answer;
      if (Object.hasOwn(state.variables, name)) return state.variables[name];
      if (
        [
          "sin",
          "cos",
          "tan",
          "asin",
          "acos",
          "atan",
          "sinh",
          "cosh",
          "tanh",
          "asinh",
          "acosh",
          "atanh",
        ].includes(name)
      ) {
        const [v] = args();
        if (name.endsWith("h") && !name.startsWith("a")) return Math[name](v);
        if (name.startsWith("a")) {
          let r = Math[name](v);
          if (["asin", "acos", "atan"].includes(name) && state.angle === "DEG")
            r *= 180 / Math.PI;
          return r;
        }
        return Math[name](state.angle === "DEG" ? (v * Math.PI) / 180 : v);
      }
      const f = {
        sqrt: Math.sqrt,
        cbrt: Math.cbrt,
        abs: Math.abs,
        ln: Math.log,
        log: Math.log10,
        log2: Math.log2,
        exp: Math.exp,
        floor: Math.floor,
        ceil: Math.ceil,
        round: Math.round,
        factorial,
        npr,
        ncr,
      };
      if (Object.hasOwn(f, name)) return f[name](...args());
      throw Error(`Unknown function or variable: ${name}`);
    }
  }
  function historyAdd(expr, result, module = "Scientific") {
    state.history.unshift({
      expression: expr,
      result,
      time: Date.now(),
      module,
    });
    state.history = state.history.slice(0, 200);
    localStorage.setItem("nova-history", JSON.stringify(state.history));
    renderHistory();
  }
  function calculate() {
    try {
      const source = state.expression,
        v = new Parser(source).parse(),
        result = fmt(v);
      preview.textContent = `${source} =`;
      state.expression = result;
      state.answer = v;
      state.reset = true;
      historyAdd(source, result);
      update();
    } catch (e) {
      preview.textContent = "";
      state.expression = "Error";
      state.reset = true;
      update();
      toast(e.message);
    }
  }
  function unary(action) {
    try {
      const v = new Parser(state.expression).parse();
      let r;
      const map = {
        sqrt: Math.sqrt,
        cbrt: Math.cbrt,
        square: (x) => x * x,
        cube: (x) => x * x * x,
        inverse: (x) => 1 / x,
        log: Math.log10,
        ln: Math.log,
        log2: Math.log2,
        tenPower: (x) => 10 ** x,
        abs: Math.abs,
        factorial,
      };
      if (map[action]) r = map[action](v);
      else if (
        [
          "sin",
          "cos",
          "tan",
          "asin",
          "acos",
          "atan",
          "sinh",
          "cosh",
          "tanh",
        ].includes(action)
      ) {
        const p = new Parser(action + `(${v})`);
        r = p.parse();
      } else throw Error("Unsupported operation");
      state.expression = fmt(r);
      state.answer = r;
      state.reset = true;
      preview.textContent = `${action}(${fmt(v)}) =`;
      historyAdd(`${action}(${fmt(v)})`, state.expression);
      update();
    } catch (e) {
      state.expression = "Error";
      state.reset = true;
      update();
      toast(e.message);
    }
  }
  function action(a) {
    if (
      [
        "sqrt",
        "cbrt",
        "square",
        "cube",
        "inverse",
        "log",
        "ln",
        "log2",
        "tenPower",
        "abs",
        "factorial",
        "sin",
        "cos",
        "tan",
        "asin",
        "acos",
        "atan",
        "sinh",
        "cosh",
        "tanh",
      ].includes(a)
    ) {
      unary(a);
      return;
    }
    const d = {
      pi: "π",
      e: "e",
      openParen: "(",
      closeParen: ")",
      ans: "Ans",
      power: "^",
      mod: " mod ",
      add: "+",
      subtract: "−",
      multiply: "×",
      divide: "÷",
      decimal: ".",
      exp: "e",
    };
    if (d[a]) {
      append(d[a]);
      return;
    }
    switch (a) {
      case "second":
        $$(".scientific-grid button").forEach((button) => {
          if (button.dataset.action === "sin") button.textContent = "asin";
          else if (button.dataset.action === "cos") button.textContent = "acos";
          else if (button.dataset.action === "tan") button.textContent = "atan";
        });
        toast("Inverse trig functions enabled");
        break;
      case "clear":
        clear();
        break;
      case "backspace":
        back();
        break;
      case "equals":
        calculate();
        break;
      case "toggleSign":
        appendOperatorSign();
        break;
      case "percent":
        append("/100");
        break;
      case "random":
        append(String(Math.random()));
        break;
      case "perm":
        append("npr(");
        break;
      case "comb":
        append("ncr(");
        break;
      case "clearMemory":
        state.memory = 0;
        update();
        break;
      case "memoryAdd":
        try {
          state.memory += new Parser(state.expression).parse();
          update();
        } catch (e) {
          toast(e.message);
        }
        break;
      case "memorySubtract":
        try {
          state.memory -= new Parser(state.expression).parse();
          update();
        } catch (e) {
          toast(e.message);
        }
        break;
      case "memoryRecall":
        append(fmt(state.memory));
        break;
      case "fraction":
        append("/");
        break;
    }
  }
  function appendOperatorSign() {
    if (state.expression === "0") append("-");
    else append(state.expression.endsWith("-") ? "" : "−");
  }

  $$(".nav-item[data-module]").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".nav-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $$(".module-panel").forEach((panel) => panel.classList.remove("active"));
      const panel = $("#" + button.dataset.module + "-panel");
      if (panel) panel.classList.add("active");
      $("#moduleTitle").textContent =
        button.querySelector("b")?.textContent || button.textContent.trim();
      $(".sidebar").classList.remove("open");
    });
  });
  $("#mobileMenu").onclick = () => $(".sidebar").classList.toggle("open");
  $$(".scientific-grid button").forEach(
    (b) =>
      (b.onclick = () =>
        b.dataset.number !== undefined
          ? append(b.dataset.number)
          : action(b.dataset.action)),
  );
  function setAngle(a) {
    state.angle = a;
    $("#degreeMode").classList.toggle("active", a === "DEG");
    $("#radianMode").classList.toggle("active", a === "RAD");
  }
  $("#degreeMode").onclick = () => setAngle("DEG");
  $("#radianMode").onclick = () => setAngle("RAD");
  $("#precision").onchange = (e) => {
    state.precision = Number(e.target.value);
    localStorage.setItem("nova-precision", e.target.value);
    update();
  };
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea,select")) return;
    if (/^[0-9.]$/.test(e.key)) {
      append(e.key);
      return;
    }
    if (e.key === "Enter" || e.key === "=") calculate();
    else if (e.key === "Backspace") back();
    else if (e.key === "Escape") clear();
    else if (["+", "-", "*", "/", "^", "(", ")"].includes(e.key))
      append(
        e.key === "-" ? "−" : e.key === "*" ? "×" : e.key === "/" ? "÷" : e.key,
      );
  });

  // Graph
  const canvas = $("#graphCanvas"),
    ctx = canvas?.getContext("2d");
  function drawGraph() {
    if (!ctx) return;
    const r = canvas.getBoundingClientRect(),
      w = r.width,
      h = r.height,
      cx = w / 2 + state.offsetX,
      cy = h / 2 + state.offsetY,
      s = state.scale;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(
      "--graph-bg",
    );
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--grid");
    ctx.lineWidth = 1;
    for (let x = cx % s; x < w; x += s) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = cy % s; y < h; y += s) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--axis");
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();
    const colors = ["#8b5cf6", "#22d3ee", "#f472b6", "#34d399", "#f59e0b"];
    state.equations.forEach((eq, i) => {
      ctx.beginPath();
      ctx.strokeStyle = colors[i % colors.length];
      ctx.lineWidth = 2.5;
      let started = false;
      for (let px = 0; px < w; px++) {
        const x = (px - cx) / s;
        try {
          const y = new Parser(eq.replace(/x/g, `(${x})`)).parse(),
            py = cy - y * s;
          if (!Number.isFinite(py) || Math.abs(py) > h * 20) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else ctx.lineTo(px, py);
        } catch (e) {
          started = false;
        }
      }
      ctx.stroke();
    });
  }
  if (canvas) {
    const resize = () => {
      const r = canvas.getBoundingRect
        ? canvas.getBoundingRect()
        : canvas.getBoundingClientRect();
      canvas.width = r.width * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      drawGraph();
    };
    new ResizeObserver(resize).observe(canvas);
    canvas.onwheel = (e) => {
      e.preventDefault();
      state.scale *= e.deltaY < 0 ? 1.12 : 0.89;
      drawGraph();
    };
    let drag = false,
      last;
    canvas.onpointerdown = (e) => {
      drag = true;
      last = [e.clientX, e.clientY];
    };
    canvas.onpointermove = (e) => {
      if (drag) {
        state.offsetX += e.clientX - last[0];
        state.offsetY += e.clientY - last[1];
        last = [e.clientX, e.clientY];
        drawGraph();
      }
    };
    canvas.onpointerup = () => (drag = false);
  }
  function legend() {
    const el = $("#graphLegend");
    if (!el) return;
    el.innerHTML = state.equations
      .map(
        (e, i) =>
          `<span><i style="background:${["#8b5cf6", "#22d3ee", "#f472b6", "#34d399", "#f59e0b"][i % 5]}"></i>${esc(e)} <button data-remove="${i}">×</button></span>`,
      )
      .join("");
    $$("[data-remove]", el).forEach(
      (b) =>
        (b.onclick = () => {
          state.equations.splice(Number(b.dataset.remove), 1);
          legend();
          drawGraph();
        }),
    );
  }
  legend();
  $("#addGraph")?.addEventListener("click", () => {
    const e = $("#graphExpression").value.trim();
    if (e && !state.equations.includes(e)) state.equations.push(e);
    legend();
    drawGraph();
  });
  $("#zoomIn")?.addEventListener("click", () => {
    state.scale *= 1.2;
    drawGraph();
  });
  $("#zoomOut")?.addEventListener("click", () => {
    state.scale /= 1.2;
    drawGraph();
  });
  $("#resetGraph")?.addEventListener("click", () => {
    state.scale = 45;
    state.offsetX = 0;
    state.offsetY = 0;
    state.equations = ["sin(x)"];
    legend();
    drawGraph();
  });
  $("#analyzeGraph")?.addEventListener("click", () => {
    const eq = state.equations.at(-1) || "";
    const roots = [];
    for (let x = -10; x <= 10; x += 0.05) {
      try {
        const y = new Parser(eq.replace(/x/g, `(${x})`)).parse();
        if (Math.abs(y) < 0.04 && !roots.some((r) => Math.abs(r - x) < 0.1))
          roots.push(fmt(x));
      } catch (e) {}
    }
    $("#graphOutput").textContent =
      `Functions: ${state.equations.length}\nApproximate x-intercepts: ${roots.join(", ") || "None found"}\nInspected range: [-10, 10]`;
  });

  // Equation solver
  function renderSolver() {
    const t = $("#solverType")?.value,
      r = $("#solverFields");
    if (!r) return;
    const f = {
      linear:
        '<input id="solA" value="2"><input id="solB" value="-4"><input id="solC" value="6">',
      quadratic:
        '<input id="solA" value="1"><input id="solB" value="-5"><input id="solC" value="6">',
      polynomial: '<input id="polyCoefficients" value="1,-6,11,-6">',
      simultaneous:
        '<input id="eq11" value="2"><input id="eq12" value="1"><input id="eq1r" value="5"><input id="eq21" value="1"><input id="eq22" value="-1"><input id="eq2r" value="1">',
    };
    r.innerHTML = f[t] || f.linear;
  }
  renderSolver();
  $("#solverType")?.addEventListener("change", renderSolver);
  $("#solveEquation")?.addEventListener("click", () => {
    const t = $("#solverType").value;
    let text = "";
    try {
      if (t === "linear" || t === "quadratic") {
        const a = Number($("#solA").value),
          b = Number($("#solB").value),
          c = Number($("#solC").value);
        if (t === "linear") {
          if (a === 0) text = b === c ? "Infinite solutions" : "No solution";
          else
            text = `${a}x + (${b}) = ${c}\n${a}x = ${c - b}\nx = ${fmt((c - b) / a)}`;
        } else {
          if (a === 0) throw Error("a cannot be zero");
          const d = b * b - 4 * a * c;
          text = `Δ = b² − 4ac = ${fmt(d)}\n`;
          if (d >= 0) {
            text +=
              d === 0
                ? `Repeated solution: x = ${fmt(-b / (2 * a))}`
                : `x₁ = ${fmt((-b + Math.sqrt(d)) / (2 * a))}\nx₂ = ${fmt((-b - Math.sqrt(d)) / (2 * a))}`;
          } else
            text += `Complex: x = ${fmt(-b / (2 * a))} ± ${fmt(Math.sqrt(-d) / (2 * a))}i`;
        }
      } else if (t === "simultaneous") {
        const a = Number($("#eq11").value),
          b = Number($("#eq12").value),
          r1 = Number($("#eq1r").value),
          c = Number($("#eq21").value),
          d = Number($("#eq22").value),
          r2 = Number($("#eq2r").value),
          det = a * d - b * c;
        if (det === 0) text = "Determinant is zero: no unique solution";
        else
          text = `x = ${fmt((r1 * d - b * r2) / det)}\ny = ${fmt((a * r2 - r1 * c) / det)}`;
      } else {
        const co = $("#polyCoefficients").value.split(",").map(Number);
        if (co.some(Number.isNaN))
          throw Error("Use comma-separated coefficients");
        const roots = [];
        for (let x = -100; x <= 100; x += 0.05) {
          const y = co.reduce((s, v) => s * x + v, 0);
          if (Math.abs(y) < 0.08 && !roots.some((r) => Math.abs(r - x) < 0.15))
            roots.push(fmt(x));
        }
        text = roots.length
          ? `Real roots near: ${roots.join(", ")}`
          : "No real roots found in [-100,100]";
      }
      $("#solverOutput").textContent = text;
    } catch (e) {
      $("#solverOutput").textContent = "Error: " + e.message;
    }
  });

  // Calculus
  if ($("#runCalculus"))
    $("#runCalculus").onclick = () => {
      const expr = $("#calcExpression").value,
        a = Number($("#calcA").value),
        b = Number($("#calcB").value),
        type = $("#calculusType").value;
      try {
        let text = "";
        if (type === "derivative") {
          const f = (x) => new Parser(expr.replace(/x/g, `(${x})`)).parse(),
            h = 0.000001,
            textV = (f(a + h) - f(a - h)) / (2 * h);
          text = `f′(${a}) ≈ ${fmt(textV)}\nSymmetric step h = ${h}`;
        } else if (type === "integral") {
          const f = (x) => new Parser(expr.replace(/x/g, `(${x})`)).parse(),
            n = 2000,
            h = (b - a) / n;
          let s = f(a) + f(b);
          for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
          text = `∫[${a}, ${b}] f(x) dx ≈ ${fmt((s * h) / 3)}\nSimpson's rule, n = ${n}`;
        } else {
          const f = (x) => new Parser(expr.replace(/x/g, `(${x})`)).parse(),
            l = f(a - 0.000001),
            r = f(a + 0.000001);
          text =
            Math.abs(l - r) < 0.0001
              ? `Limit x → ${a}: ${fmt((l + r) / 2)}`
              : `Limit differs by side\nLeft ≈ ${fmt(l)}\nRight ≈ ${fmt(r)}`;
        }
        $("#calculusOutput").textContent = text;
      } catch (e) {
        $("#calculusOutput").textContent = "Error: " + e.message;
      }
    };

  // Statistics
  if ($("#runStats"))
    $("#runStats").onclick = () => {
      try {
        const v = $("#statsInput")
          .value.split(/[,\s]+/)
          .filter(Boolean)
          .map(Number);
        if (!v.length || v.some(Number.isNaN))
          throw Error("Enter valid numbers");
        const n = v.length,
          mean = v.reduce((a, b) => a + b, 0) / n,
          s = [...v].sort((a, b) => a - b),
          median = n % 2 ? s[n / 2 - 0.5] : (s[n / 2 - 1] + s[n / 2]) / 2,
          c = {};
        v.forEach((x) => (c[x] = (c[x] || 0) + 1));
        const m = Math.max(...Object.values(c)),
          mode = Object.keys(c)
            .filter((k) => c[k] === m)
            .map(Number),
          vp = v.reduce((a, x) => a + (x - mean) ** 2, 0) / n,
          vs = v.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1 || 1);
        $("#statsOutput").textContent =
          `Count: ${n}\nSum: ${fmt(v.reduce((a, b) => a + b, 0))}\nMean: ${fmt(mean)}\nMedian: ${fmt(median)}\nMode: ${mode.join(", ")}\nMin / Max: ${fmt(Math.min(...v))} / ${fmt(Math.max(...v))}\nPopulation σ: ${fmt(Math.sqrt(vp))}\nSample s: ${fmt(Math.sqrt(vs))}\nPopulation variance: ${fmt(vp)}\nSample variance: ${fmt(vs)}\nRange: ${fmt(Math.max(...v) - Math.min(...v))}`;
      } catch (e) {
        $("#statsOutput").textContent = "Error: " + e.message;
      }
    };
  if ($("#runProbability"))
    $("#runProbability").onclick = () => {
      try {
        const n = Number($("#permN").value),
          k = Number($("#permK").value);
        $("#statsOutput").textContent =
          `nPr = ${fmt(npr(n, k))}\nnCr = ${fmt(ncr(n, k))}`;
      } catch (e) {
        $("#statsOutput").textContent = "Error: " + e.message;
      }
    };

  // Matrix
  function parseMatrix(t) {
    const r = t
      .trim()
      .split(";")
      .map((x) => x.split(",").map(Number));
    if (
      !r.length ||
      r.some((x) => x.length !== r[0].length) ||
      r.flat().some(Number.isNaN)
    )
      throw Error("Invalid matrix format");
    return r;
  }
  function fmtMatrix(m) {
    return m.map((r) => r.map(fmt).join("\t")).join("\n");
  }
  function det(a) {
    if (a.length !== a[0].length) throw Error("Matrix must be square");
    if (a.length === 1) return a[0][0];
    if (a.length === 2) return a[0][0] * a[1][1] - a[0][1] * a[1][0];
    let d = 0;
    for (let c = 0; c < a.length; c++)
      d +=
        (-1) ** c *
        a[0][c] *
        det(a.slice(1).map((r) => r.filter((_, j) => j !== c)));
    return d;
  }
  function inv(a) {
    const n = a.length,
      d = det(a);
    if (n !== a[0].length) throw Error("Matrix must be square");
    if (Math.abs(d) < 1e-12) throw Error("Matrix is singular");
    const z = a.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++)
        if (Math.abs(z[r][c]) > Math.abs(z[p][c])) p = r;
      [z[c], z[p]] = [z[p], z[c]];
      const pv = z[c][c];
      for (let j = 0; j < 2 * n; j++) z[c][j] /= pv;
      for (let r = 0; r < n; r++)
        if (r !== c) {
          const f = z[r][c];
          for (let j = 0; j < 2 * n; j++) z[r][j] -= f * z[c][j];
        }
    }
    return z.map((r) => r.slice(n));
  }
  function mul(a, b) {
    if (a[0].length !== b.length) throw Error("Incompatible dimensions");
    return a.map((r) =>
      b[0].map((_, j) => r.reduce((s, v, i) => s + v * b[i][j], 0)),
    );
  }
  if ($("#runMatrix"))
    $("#runMatrix").onclick = () => {
      try {
        const a = parseMatrix($("#matrixA").value),
          op = $("#matrixOperation").value;
        let r;
        if (op === "det") r = `det(A) = ${fmt(det(a))}`;
        else if (op === "transpose")
          r = fmtMatrix(a[0].map((_, j) => a.map((x) => x[j])));
        else if (op === "inverse") r = fmtMatrix(inv(a));
        else if (op === "multiply")
          r = fmtMatrix(mul(a, parseMatrix($("#matrixB").value)));
        else {
          if (a.length !== 2 || a[0].length !== 2)
            throw Error("Eigenvalues currently support 2×2 matrices");
          const tr = a[0][0] + a[1][1],
            dd = a[0][0] * a[1][1] - a[0][1] * a[1][0],
            disc = tr * tr - 4 * dd;
          r =
            disc >= 0
              ? `Eigenvalues: ${fmt((tr + Math.sqrt(disc)) / 2)}, ${fmt((tr - Math.sqrt(disc)) / 2)}`
              : `Eigenvalues: ${fmt(tr / 2)} ± ${fmt(Math.sqrt(-disc) / 2)}i`;
        }
        $("#matrixOutput").textContent = r;
      } catch (e) {
        $("#matrixOutput").textContent = "Error: " + e.message;
      }
    };

  // Converters
  const units = {
    Length: {
      m: 1,
      cm: 0.01,
      mm: 0.001,
      km: 1000,
      in: 0.0254,
      ft: 0.3048,
      yd: 0.9144,
      mi: 1609.344,
    },
    Mass: { kg: 1, g: 0.001, mg: 0.000001, lb: 0.45359237, oz: 0.028349523125 },
    Temperature: {
      C: { a: (v) => v, b: (v) => v },
      F: { a: (v) => ((v - 32) * 5) / 9, b: (v) => (v * 9) / 5 + 32 },
      K: { a: (v) => v - 273.15, b: (v) => v + 273.15 },
    },
    Speed: { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, knot: 0.514444 },
    Time: { s: 1, min: 60, h: 3600, day: 86400, week: 604800, year: 31557600 },
    Area: {
      "m²": 1,
      "cm²": 0.0001,
      "km²": 1e6,
      ft2: 0.09290304,
      acre: 4046.8564224,
    },
    Volume: {
      "m³": 1,
      L: 0.001,
      mL: 0.000001,
      gallon: 0.003785411784,
      ft3: 0.028316846592,
    },
    Pressure: {
      Pa: 1,
      kPa: 1000,
      bar: 100000,
      psi: 6894.757293168,
      atm: 101325,
    },
    Energy: {
      J: 1,
      kJ: 1000,
      cal: 4.184,
      kcal: 4184,
      Wh: 3600,
      kWh: 3600000,
      eV: 1.602176634e-19,
    },
    Data: {
      byte: 1,
      kB: 1000,
      MB: 1e6,
      GB: 1e9,
      KiB: 1024,
      MiB: 1048576,
      GiB: 1073741824,
    },
  };
  function fillUnits() {
    const c = $("#conversionCategory").value,
      u = Object.keys(units[c]);
    $("#conversionFrom").innerHTML = u
      .map((x) => `<option>${x}</option>`)
      .join("");
    $("#conversionTo").innerHTML = u
      .map((x) => `<option>${x}</option>`)
      .join("");
    if (u.length > 1) $("#conversionTo").selectedIndex = 1;
    if (c === "Temperature") $("#conversionTo").value = "F";
  }
  if ($("#conversionCategory")) {
    $("#conversionCategory").innerHTML = Object.keys(units)
      .map((x) => `<option>${x}</option>`)
      .join("");
    fillUnits();
    $("#conversionCategory").onchange = fillUnits;
    $("#runConversion").onclick = () => {
      try {
        const c = $("#conversionCategory").value,
          v = Number($("#conversionValue").value),
          f = $("#conversionFrom").value,
          t = $("#conversionTo").value,
          r =
            c === "Temperature"
              ? units[c][t].b(units[c][f].a(v))
              : (v * units[c][f]) / units[c][t];
        $("#conversionOutput").textContent = `${fmt(r)} ${t}`;
      } catch (e) {
        $("#conversionOutput").textContent = "Error";
      }
    };
  }

  // Physics
  function physicsFields() {
    const f = $("#physicsFormula").value,
      fields = {
        force: ["Mass (kg)", "Acceleration (m/s²)"],
        kinetic: ["Mass (kg)", "Velocity (m/s)"],
        ohm: ["Current (A)", "Resistance (Ω)"],
        density: ["Mass (kg)", "Volume (m³)"],
        wave: ["Frequency (Hz)", "Wavelength (m)"],
      };
    $("#physicsFields").innerHTML = (fields[f] || fields.force)
      .map(
        (l, i) =>
          `<label>${l}<input type="number" value="${i ? 10 : 2}" class="physics-value"></label>`,
      )
      .join("");
  }
  if ($("#physicsFormula")) {
    physicsFields();
    $("#physicsFormula").onchange = physicsFields;
    $("#runPhysics").onclick = () => {
      const f = $("#physicsFormula").value,
        v = $$(".physics-value").map((x) => Number(x.value));
      let r, u, e;
      if (f === "force") {
        r = v[0] * v[1];
        u = "N";
        e = "F = ma";
      } else if (f === "kinetic") {
        r = 0.5 * v[0] * v[1] ** 2;
        u = "J";
        e = "KE = ½mv²";
      } else if (f === "ohm") {
        r = v[0] * v[1];
        u = "V";
        e = "V = IR";
      } else if (f === "density") {
        if (v[1] === 0) {
          $("#physicsOutput").textContent = "Error: Volume cannot be zero";
          return;
        }
        r = v[0] / v[1];
        u = "kg/m³";
        e = "ρ = m/V";
      } else {
        r = v[0] * v[1];
        u = "m/s";
        e = "v = fλ";
      }
      $("#physicsOutput").textContent = `${e}\nResult: ${fmt(r)} ${u}`;
    };
  }

  // Quick tools, variables, history, copy, theme
  $$("[data-tool]").forEach(
    (b) =>
      (b.onclick = () => {
        const t = b.dataset.tool,
          o = $("#quickOutput");
        if (t === "constants")
          o.innerHTML =
            "G = 6.67430e-11 N·m²/kg²<br>c = 299792458 m/s<br>h = 6.62607015e-34 J·s";
        if (t === "variables") {
          const n = prompt("Variable name");
          if (!n) return;
          const v = Number(prompt(`Value for ${n}`));
          if (Number.isFinite(v)) {
            state.variables[n] = v;
            localStorage.setItem(
              "nova-variables",
              JSON.stringify(state.variables),
            );
            o.textContent = `${n} = ${v}`;
          }
        }
        if (t === "base") {
          const n = Number(prompt("Enter an integer", "42"));
          if (Number.isInteger(n))
            o.innerHTML = `Binary: ${n.toString(2)}<br>Octal: ${n.toString(8)}<br>Hex: ${n.toString(16).toUpperCase()}`;
        }
      }),
  );
  function renderHistory(s = "") {
    const l = $("#historyList");
    if (!l) return;
    const f = state.history.filter((x) =>
      `${x.expression} ${x.result}`.toLowerCase().includes(s.toLowerCase()),
    );
    l.innerHTML = f.length
      ? f
          .map(
            (x, i) =>
              `<button class="history-item" data-history="${i}"><span>${esc(x.expression)} =</span><strong>${esc(x.result)}</strong><small>${new Date(x.time).toLocaleString()}</small></button>`,
          )
          .join("")
      : '<div class="empty-state">No calculations yet</div>';
  }
  $("#historyToggle")?.addEventListener("click", () =>
    $("#historyDrawer").classList.add("open"),
  );
  $("#closeHistory")?.addEventListener("click", () =>
    $("#historyDrawer").classList.remove("open"),
  );
  $("#historySearch")?.addEventListener("input", (e) =>
    renderHistory(e.target.value),
  );
  $("#clearHistory")?.addEventListener("click", () => {
    state.history = [];
    localStorage.removeItem("nova-history");
    renderHistory();
  });
  $("#historyList")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-history]");
    if (!b) return;
    const x = state.history[Number(b.dataset.history)];
    if (x) {
      state.expression = x.expression;
      preview.textContent = `${x.expression} =`;
      update();
      $("#historyDrawer").classList.remove("open");
    }
  });
  $("#copyResult")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.expression);
      toast("Result copied");
    } catch (e) {
      toast("Clipboard unavailable");
    }
  });
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $("#themeToggle").textContent = t === "dark" ? "☼" : "☾";
    localStorage.setItem("nova-theme", t);
    setTimeout(drawGraph, 20);
  }
  $("#themeToggle")?.addEventListener("click", () =>
    applyTheme(
      document.documentElement.dataset.theme === "dark" ? "light" : "dark",
    ),
  );
  applyTheme(state.theme);
  $("#precision").value = String(
    [6, 9, 12, 15].includes(state.precision) ? state.precision : 12,
  );
  renderHistory();
  update();
})();
