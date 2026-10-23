import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEarnings } from '../dist/earnings-math.js';

test('estimates the fixed 20% share over weekly, fortnightly, and average monthly periods', () => {
  assert.deepEqual(calculateEarnings('300', '3'), {
    weeklyCents: 18_000,
    fortnightlyCents: 36_000,
    monthlyCents: 78_000,
  });
  assert.deepEqual(calculateEarnings('123.45', '4'), {
    weeklyCents: 9_876,
    fortnightlyCents: 19_752,
    monthlyCents: 42_796,
  });
});

test('accepts zero, inclusive sales boundaries, and one to seven nights', () => {
  assert.deepEqual(calculateEarnings('0', '1'), {
    weeklyCents: 0,
    fortnightlyCents: 0,
    monthlyCents: 0,
  });
  assert.deepEqual(calculateEarnings('10000.00', '7'), {
    weeklyCents: 1_400_000,
    fortnightlyCents: 2_800_000,
    monthlyCents: 6_066_667,
  });
});

test('allows surrounding whitespace and one or two decimal places', () => {
  assert.deepEqual(calculateEarnings(' 300.0\t', '\n3 '), calculateEarnings('300.00', '3'));
  assert.deepEqual(calculateEarnings('0.10', '1'), {
    weeklyCents: 2,
    fortnightlyCents: 4,
    monthlyCents: 9,
  });
});

test('rounds each final period from the original cents, not a rounded weekly result', () => {
  assert.deepEqual(calculateEarnings('0.01', '3'), {
    weeklyCents: 1,
    fortnightlyCents: 1,
    monthlyCents: 3,
  });
  assert.deepEqual(calculateEarnings('0.02', '1'), {
    weeklyCents: 0,
    fortnightlyCents: 1,
    monthlyCents: 2,
  });
  assert.deepEqual(calculateEarnings('0.01', '7'), {
    weeklyCents: 1,
    fortnightlyCents: 3,
    monthlyCents: 6,
  });
});

test('uses an average calendar month rather than four weeks', () => {
  const result = calculateEarnings('100', '1');
  assert.equal(result.weeklyCents, 2_000);
  assert.equal(result.monthlyCents, 8_667);
  assert.notEqual(result.monthlyCents, result.weeklyCents * 4);
});

test('rejects incomplete, out-of-range, or non-decimal sales without producing estimates', () => {
  for (const sales of [
    '', ' ', '-1', '-0', '+1', '10000.01', '10001', '999999999999999999999999',
    '.5', '1.', '1.001', '1e2', '0x10', '1,000', 'NaN', 'Infinity', '1 USD', '1\n2',
  ]) {
    assert.equal(calculateEarnings(sales, '3'), null, `invalid sales: ${JSON.stringify(sales)}`);
  }
});

test('rejects incomplete or non-whole nights outside one through seven', () => {
  for (const nights of ['', ' ', '0', '8', '-1', '+1', '1.0', '1.5', '01', '1e0', '0x1', 'NaN', 'Infinity', '3 nights']) {
    assert.equal(calculateEarnings('300', nights), null, `invalid nights: ${JSON.stringify(nights)}`);
  }
});

test('rejects non-string values rather than coercing input', () => {
  const values = [null, undefined, 300, NaN, Infinity, true, {}, [], ['300'], { toString: () => '300' }];
  for (const value of values) {
    assert.equal(calculateEarnings(value, '3'), null);
    assert.equal(calculateEarnings('300', value), null);
  }
});

test('every valid estimate remains a finite, nonnegative integer number of cents', () => {
  for (const sales of ['0', '0.01', '0.99', '1.05', '9999.99', '10000']) {
    for (let nights = 1; nights <= 7; nights += 1) {
      const result = calculateEarnings(sales, String(nights));
      assert.ok(result);
      for (const cents of Object.values(result)) {
        assert.ok(Number.isSafeInteger(cents));
        assert.ok(cents >= 0);
      }
    }
  }
});
