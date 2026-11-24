// Get elements
const display = document.getElementById("display");
const historyPreview = document.getElementById("historyPreview");
const degreeModeButton = document.getElementById("degreeMode");
const radianModeButton = document.getElementById("radianMode");
const memoryIndicator = document.getElementById("memoryIndicator");

let expression = "0";
let angleMode = "DEG";
let memory = 0;
let lastAnswer = 0;
let shouldReset = false;

const operatorSymbols = ["+", "−", "×", "÷", "^", "mod"];

// Update display
function updateDisplay() {
  display.value = expression;
  memoryIndicator.textContent = memory === 0 ? "M" : "M•";
}

function setExpression(value) {
  expression = value;
  shouldReset = false;
  updateDisplay();
}

function appendValue(value) {
  if (shouldReset) {
    expression = "0";
    shouldReset = false;
  }
  expression = expression === "0" ? value : expression + value;
  updateDisplay();
}

// Handle number input
function inputNumber(number) {
  appendValue(number);
}

// Decimal point
function addDecimal() {
  if (shouldReset) {
    expression = "0.";
    shouldReset = false;
  } else {
    const currentNumber = expression.split(/[+−×÷^()]/).pop();
    if (!currentNumber.includes(".")) expression += ".";
  }
  updateDisplay();
}

// Backspace
function backspace() {
  if (shouldReset) {
    expression = "0";
    shouldReset = false;
  } else {
    expression = expression.length > 1 ? expression.slice(0, -1) : "0";
  }
  updateDisplay();
}

// Clear all
function clearAll() {
  expression = "0";
  historyPreview.textContent = "";
  shouldReset = false;
  updateDisplay();
}

// Operators
function appendOperator(operator) {
  const symbols = ["+", "−", "×", "÷", "^", "mod"];
  if (shouldReset) shouldReset = false;
  const last = expression.trim().slice(-1);
  if (expression === "0" || expression === "Error") {
    expression = "0" + operator;
  } else if (symbols.some((symbol) => expression.endsWith(symbol))) {
    expression = expression.slice(0, -1) + operator;
  } else {
    expression += operator;
  }
  updateDisplay();
}

// Calculate result
function evaluateExpression() {
  try {
    let value = expression;

    // Convert trig calls so degree mode is applied, including inverse trig results.
    value = value.replace(/\b(sin|cos|tan)\(([^()]*)\)/g, (_, fn, argument) => {
      const normalizedArgument = normalizeExpression(argument);
      const n = Function("return " + normalizedArgument)();
      const result = Math[fn](angleValue(n));
      return `(${result})`;
    });

    value = value.replace(
      /\b(asin|acos|atan)\(([^()]*)\)/g,
      (_, fn, argument) => {
        const normalizedArgument = normalizeExpression(argument);
        const n = Function("return " + normalizedArgument)();
        let result = Math[fn](n);
        if (angleMode === "DEG") result *= 180 / Math.PI;
        return `(${result})`;
      },
    );

    value = normalizeExpression(value);
    if (!/^[0-9+\-*/().\s%*eE]+$/.test(value.replace(/Math\.\w+/g, "Math"))) {
      throw new Error("Invalid expression");
    }

    const result = Function(
      "sin",
      "cos",
      "tan",
      "asin",
      "acos",
      "atan",
      "log10",
      "ln",
      "sqrt",
      "abs",
      "exp",
      "return (" + value + ")",
    )(
      Math.sin,
      Math.cos,
      Math.tan,
      Math.asin,
      Math.acos,
      Math.atan,
      Math.log10,
      Math.log,
      Math.sqrt,
      Math.abs,
      Math.exp,
    );

    if (typeof result !== "number" || !Number.isFinite(result))
      throw new Error("Math Error");

    const formatted = formatResult(result);
    historyPreview.textContent = `${expression} =`;
    expression = formatted;
    lastAnswer = result;
    shouldReset = true;
    updateDisplay();
  } catch (error) {
    expression = "Error";
    historyPreview.textContent = "";
    shouldReset = true;
    updateDisplay();
  }
}

function normalizeExpression(value) {
  let normalized = value
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/π/g, `(${Math.PI})`)
    .replace(/e(?![0-9])/g, `(${Math.E})`)
    .replace(/mod/g, "%")
    .replace(/\^/g, "**");

  normalized = normalized.replace(/Ans/g, `(${lastAnswer})`);

  // Scientific functions are rewritten before evaluation.
  const functions = {
    sin: "sin",
    cos: "cos",
    tan: "tan",
    asin: "asin",
    acos: "acos",
    atan: "atan",
    log: "log10",
    ln: "ln",
    sqrt: "sqrt",
    abs: "abs",
    exp: "exp",
  };

  for (const [name, jsName] of Object.entries(functions)) {
    const pattern = new RegExp(`\\b${name}\\s*\\(`, "g");
    normalized = normalized.replace(pattern, `Math.${jsName}(`);
  }

  return normalized;
}

function angleValue(value) {
  const radians = angleMode === "DEG" ? (value * Math.PI) / 180 : value;
  return radians;
}

function formatResult(value) {
  if (Object.is(value, -0)) value = 0;
  if (Number.isInteger(value)) return value.toString();
  return parseFloat(value.toPrecision(12)).toString();
}

// Unary operations
function applyUnary(operation) {
  try {
    const value = Number(expression);
    if (!Number.isFinite(value)) throw new Error();
    let result;

    switch (operation) {
      case "sin":
        result = Math.sin(angleValue(value));
        break;
      case "cos":
        result = Math.cos(angleValue(value));
        break;
      case "tan":
        result = Math.tan(angleValue(value));
        break;
      case "asin":
        result =
          angleMode === "DEG"
            ? (Math.asin(value) * 180) / Math.PI
            : Math.asin(value);
        break;
      case "acos":
        result =
          angleMode === "DEG"
            ? (Math.acos(value) * 180) / Math.PI
            : Math.acos(value);
        break;
      case "atan":
        result =
          angleMode === "DEG"
            ? (Math.atan(value) * 180) / Math.PI
            : Math.atan(value);
        break;
      case "sqrt":
        result = Math.sqrt(value);
        break;
      case "square":
        result = value ** 2;
        break;
      case "cube":
        result = value ** 3;
        break;
      case "inverse":
        result = 1 / value;
        break;
      case "log":
        result = Math.log10(value);
        break;
      case "ln":
        result = Math.log(value);
        break;
      case "factorial":
        if (!Number.isInteger(value) || value < 0 || value > 170)
          throw new Error();
        result = 1;
        for (let i = 2; i <= value; i++) result *= i;
        break;
      case "toggleSign":
        result = -value;
        break;
      case "tenPower":
        result = 10 ** value;
        break;
      case "exp":
        expression += "e";
        shouldReset = false;
        updateDisplay();
        return;
      default:
        return;
    }

    if (!Number.isFinite(result)) throw new Error();
    expression = formatResult(result);
    historyPreview.textContent = `${operation}(${value})`;
    shouldReset = true;
    updateDisplay();
  } catch (_) {
    expression = "Error";
    shouldReset = true;
    updateDisplay();
  }
}

// Handle button actions
function handleAction(action) {
  if (
    [
      "sin",
      "cos",
      "tan",
      "asin",
      "acos",
      "atan",
      "sqrt",
      "square",
      "cube",
      "inverse",
      "log",
      "ln",
      "factorial",
      "toggleSign",
      "tenPower",
      "exp",
    ].includes(action)
  ) {
    applyUnary(action);
  } else if (action === "pi") {
    appendValue("π");
  } else if (action === "e") {
    appendValue("e");
  } else if (action === "percent") {
    appendOperator("×");
  } else if (action === "power") {
    appendOperator("^");
  } else if (action === "mod") {
    appendOperator("mod");
  } else if (action === "openParen") {
    appendValue("(");
  } else if (action === "closeParen") {
    appendValue(")");
  } else if (action === "ans") {
    appendValue("Ans");
  } else if (action === "memoryClear") {
    memory = 0;
    updateDisplay();
  } else if (action === "memoryAdd") {
    const value = Number(expression);
    if (Number.isFinite(value)) memory += value;
    updateDisplay();
  } else if (action === "memoryRecall") {
    appendValue(formatResult(memory));
  } else if (["add", "subtract", "multiply", "divide"].includes(action)) {
    const map = { add: "+", subtract: "−", multiply: "×", divide: "÷" };
    appendOperator(map[action]);
  }
}

// Event listeners
document.getElementById("clearAll").addEventListener("click", clearAll);
document.getElementById("backspace").addEventListener("click", backspace);
document.getElementById("equals").addEventListener("click", evaluateExpression);
document.getElementById("decimal").addEventListener("click", addDecimal);

for (let i = 0; i <= 9; i++) {
  document
    .getElementById(`num${i}`)
    .addEventListener("click", () => inputNumber(i.toString()));
}

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => handleAction(button.dataset.action));
});

degreeModeButton.addEventListener("click", () => {
  angleMode = "DEG";
  degreeModeButton.classList.add("active");
  radianModeButton.classList.remove("active");
});

radianModeButton.addEventListener("click", () => {
  angleMode = "RAD";
  radianModeButton.classList.add("active");
  degreeModeButton.classList.remove("active");
});

document.addEventListener("keydown", (event) => {
  if (/^[0-9.]$/.test(event.key)) {
    event.key === "." ? addDecimal() : inputNumber(event.key);
  } else if (event.key === "Enter" || event.key === "=") {
    evaluateExpression();
  } else if (event.key === "Backspace") {
    backspace();
  } else if (event.key === "Escape") {
    clearAll();
  } else if (
    event.key === "+" ||
    event.key === "-" ||
    event.key === "*" ||
    event.key === "/"
  ) {
    const map = { "+": "+", "-": "−", "*": "×", "/": "÷" };
    appendOperator(map[event.key]);
  }
});

// Initialize
updateDisplay();
