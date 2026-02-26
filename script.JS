// Get elements
const display = document.getElementById('display');
const historyPreview = document.getElementById('historyPreview');
let currentInput = '0';
let previousInput = '';
let operator = null;
let shouldResetDisplay = false;

// Update display
function updateDisplay() {
  display.value = currentInput;
}

// Handle number input
function inputNumber(num) {
  if (shouldResetDisplay) {
    currentInput = num;
    shouldResetDisplay = false;
  } else {
    currentInput = currentInput === '0' ? num : currentInput + num;
  }
  updateDisplay();
}

// Handle operator
function handleOperator(op) {
  if (operator !== null && !shouldResetDisplay) {
    calculate();
  }
  previousInput = currentInput;
  operator = op;
  shouldResetDisplay = true;
  historyPreview.textContent = `${previousInput} ${operator}`;
}

// Calculate result
function calculate() {
  if (operator === null || shouldResetDisplay) return;
  
  let result;
  const prev = parseFloat(previousInput);
  const current = parseFloat(currentInput);
  
  switch(operator) {
    case '+': result = prev + current; break;
    case '−': result = prev - current; break;
    case '×': result = prev * current; break;
    case '÷': result = prev / current; break;
    case '%': result = prev % current; break;
    default: return;
  }
  
  if (isNaN(result) || !isFinite(result)) {
    currentInput = 'Error';
  } else {
    currentInput = result.toString();
  }
  
  operator = null;
  shouldResetDisplay = true;
  historyPreview.textContent = '';
  updateDisplay();
}

// Clear all
function clearAll() {
  currentInput = '0';
  previousInput = '';
  operator = null;
  shouldResetDisplay = false;
  historyPreview.textContent = '';
  updateDisplay();
}

// Backspace
function backspace() {
  if (currentInput.length > 1) {
    currentInput = currentInput.slice(0, -1);
  } else {
    currentInput = '0';
  }
  updateDisplay();
}

// Decimal point
function addDecimal() {
  if (shouldResetDisplay) {
    currentInput = '0.';
    shouldResetDisplay = false;
  } else if (!currentInput.includes('.')) {
    currentInput += '.';
  }
  updateDisplay();
}

// Event listeners
document.getElementById('clearAll').addEventListener('click', clearAll);
document.getElementById('backspace').addEventListener('click', backspace);
document.getElementById('equals').addEventListener('click', calculate);
document.getElementById('decimal').addEventListener('click', addDecimal);

// Numbers
for (let i = 0; i <= 9; i++) {
  document.getElementById(`num${i}`).addEventListener('click', () => inputNumber(i.toString()));
}

// Operators
document.getElementById('add').addEventListener('click', () => handleOperator('+'));
document.getElementById('subtract').addEventListener('click', () => handleOperator('−'));
document.getElementById('multiply').addEventListener('click', () => handleOperator('×'));
document.getElementById('divide').addEventListener('click', () => handleOperator('÷'));
document.getElementById('percent').addEventListener('click', () => handleOperator('%'));

// Initialize
updateDisplay();