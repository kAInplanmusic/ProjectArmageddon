/**
 * Minimaler Test-Harness für Node.js (ohne externe Abhängigkeiten).
 * Nutzt node:test falls verfügbar, sonst einen einfachen Fallback.
 */

let usingNodeTest = false;
let suites = [];

try {
  const testModule = await import('node:test');
  globalThis.describe = testModule.describe;
  globalThis.it = testModule.it;
  usingNodeTest = true;
} catch (e) {
  suites = [];
  globalThis.describe = (name, fn) => {
    const suite = { name, tests: [] };
    suites.push(suite);
    fn();
  };
  globalThis.it = (name, fn) => {
    if (suites.length) suites[suites.length - 1].tests.push({ name, fn });
  };
}

export const describe = globalThis.describe;
export const it = globalThis.it;

export function runAndPrintResults() {
  if (usingNodeTest) return;

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const suite of suites) {
    console.log(`\n  ${suite.name}`);
    for (const test of suite.tests) {
      try {
        test.fn();
        console.log(`    ✓ ${test.name}`);
        passed++;
      } catch (err) {
        console.log(`    ✗ ${test.name}`);
        console.log(`      → ${err.message}`);
        failures.push({ suite: suite.name, test: test.name, error: err.message });
        failed++;
      }
    }
  }

  console.log(`\n─────────────────────────`);
  console.log(`  Tests: ${passed + failed} | ✓ ${passed} | ✗ ${failed}`);
  if (failures.length > 0) {
    console.log('\n  Fehlgeschlagene Tests:');
    for (const f of failures) {
      console.log(`    • ${f.suite} › ${f.test}\n      ${f.error}`);
    }
    process.exitCode = 1;
  } else {
    console.log('  Alle Tests bestanden!\n');
  }
}
