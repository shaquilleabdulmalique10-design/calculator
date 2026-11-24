/**
 * NEXUS Calculator - Comprehensive Test Suite
 * Tests all mathematical operations, modules, and edge cases
 */

// Test results storage
const results = {
  passed: [],
  failed: [],
  partial: [],
  notImplemented: []
};

function test(name, fn) {
  try {
    const result = fn();
    if (result === true) {
      results.passed.push(name);
      console.log(`✅ PASS: ${name}`);
    } else if (result === 'PARTIAL') {
      results.partial.push(name);
      console.log(`⚠️  PARTIAL: ${name}`);
    } else if (result === 'NOT_IMPLEMENTED') {
      results.notImplemented.push(name);
      console.log(`ℹ️  NOT IMPLEMENTED: ${name}`);
    } else {
      results.failed.push({ name, error: result });
      console.log(`❌ FAIL: ${name} - ${result}`);
    }
  } catch (err) {
    results.failed.push({ name, error: err.message });
    console.log(`❌ FAIL: ${name} - ${err.message}`);
  }
}

function approx(a, b, tolerance = 1e-10) {
  return Math.abs(a - b) < tolerance;
}

// Test MathParser directly
function testParser() {
  console.log('\n=== MATH PARSER TESTS ===\n');
  
  // Basic arithmetic
  test('Parser: 2+2', () => {
    const parser = new MathParser('2+2');
    return parser.parse() === 4;
  });
  
  test('Parser: 10-3', () => {
    const parser = new MathParser('10-3');
    return parser.parse() === 7;
  });
  
  test('Parser: 5*6', () => {
    const parser = new MathParser('5*6');
    return parser.parse() === 30;
  });
  
  test('Parser: 20/4', () => {
    const parser = new MathParser('20/4');
    return parser.parse() === 5;
  });
  
  test('Parser: 2^3', () => {
    const parser = new MathParser('2^3');
    return parser.parse() === 8;
  });
  
  // Unicode operators
  test('Parser: 5×6 (Unicode multiply)', () => {
    const parser = new MathParser('5×6');
    return parser.parse() === 30;
  });
  
  test('Parser: 20÷4 (Unicode divide)', () => {
    const parser = new MathParser('20÷4');
    return parser.parse() === 5;
  });
  
  test('Parser: 10−3 (Unicode minus)', () => {
    const parser = new MathParser('10−3');
    return parser.parse() === 7;
  });
  
  // Parentheses
  test('Parser: (2+3)*4', () => {
    const parser = new MathParser('(2+3)*4');
    return parser.parse() === 20;
  });
  
  test('Parser: 2*(3+4)', () => {
    const parser = new MathParser('2*(3+4)');
    return parser.parse() === 14;
  });
  
  // Implicit multiplication
  test('Parser: 2pi (implicit)', () => {
    const parser = new MathParser('2pi');
    return approx(parser.parse(), 2 * Math.PI);
  });
  
  test('Parser: 2(3+4)', () => {
    const parser = new MathParser('2(3+4)');
    return parser.parse() === 14;
  });
  
  // Trigonometry (DEG mode)
  test('Parser: sin(30) DEG', () => {
    const oldAngle = state.angle;
    state.angle = 'DEG';
    const parser = new MathParser('sin(30)');
    const result = approx(parser.parse(), 0.5);
    state.angle = oldAngle;
    return result;
  });
  
  test('Parser: cos(60) DEG', () => {
    const oldAngle = state.angle;
    state.angle = 'DEG';
    const parser = new MathParser('cos(60)');
    const result = approx(parser.parse(), 0.5);
    state.angle = oldAngle;
    return result;
  });
  
  // Functions
  test('Parser: sqrt(16)', () => {
    const parser = new MathParser('sqrt(16)');
    return parser.parse() === 4;
  });
  
  test('Parser: log(100)', () => {
    const parser = new MathParser('log(100)');
    return parser.parse() === 2;
  });
  
  test('Parser: ln(e)', () => {
    const parser = new MathParser('ln(e)');
    return approx(parser.parse(), 1);
  });
  
  // Negative numbers
  test('Parser: -5', () => {
    const parser = new MathParser('-5');
    return parser.parse() === -5;
  });
  
  test('Parser: -5+3', () => {
    const parser = new MathParser('-5+3');
    return parser.parse() === -2;
  });
  
  // Edge cases
  test('Parser: Division by zero throws error', () => {
    try {
      const parser = new MathParser('5/0');
      parser.parse();
      return 'Did not throw error';
    } catch (err) {
      return err.message.includes('zero');
    }
  });
  
  test('Parser: Missing closing paren throws error', () => {
    try {
      const parser = new MathParser('(2+3');
      parser.parse();
      return 'Did not throw error';
    } catch (err) {
      return err.message.includes('parenthesis');
    }
  });
  
  // Test colon character specifically
  test('Parser: Colon character throws error', () => {
    try {
      const parser = new MathParser('10:30');
      parser.parse();
      return 'Did not throw error';
    } catch (err) {
      return err.message.includes('Unexpected character');
    }
  });
}

// Run all tests
console.log('%c=== NEXUS CALCULATOR TEST SUITE ===', 'color:#a78bfa;font-size:16px;font-weight:bold');
console.log('Testing mathematical engine...\n');

testParser();

// Summary
console.log('\n%c=== TEST SUMMARY ===', 'color:#a78bfa;font-size:14px;font-weight:bold');
console.log(`✅ Passed: ${results.passed.length}`);
console.log(`❌ Failed: ${results.failed.length}`);
console.log(`⚠️  Partial: ${results.partial.length}`);
console.log(`ℹ️  Not Implemented: ${results.notImplemented.length}`);

if (results.failed.length > 0) {
  console.log('\n%cFailed Tests:', 'color:#f87171;font-weight:bold');
  results.failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
}

