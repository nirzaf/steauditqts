import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseCsv,
  summarizeRows,
  sourceReflection,
  baselineFixture,
  replacementFixture,
  fixtureRows,
  registerJournalRevision,
} from '../src/domain/accounting.js'
import { addMoney, compareMoney, moneyString, sumMoney } from '../src/domain/money.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name) => fs.readFileSync(path.join(here, '..', 'fixtures', name), 'utf8')
const expected = JSON.parse(fixture('expected_results.json'))

test('supplied trial-balance fixtures preserve exact Decimal results', () => {
  const baseline = parseCsv(fixture('baseline_tb.csv'), { entityId: 'CLI-0009', period: 'FY2026', currency: 'QAR', sourceId: 'TB-BASELINE-001' })
  const replacement = parseCsv(fixture('replacement_tb_aj001_reflected.csv'), { entityId: 'CLI-0009', period: 'FY2026', currency: 'QAR', sourceId: 'TB-REPLACEMENT-001' })
  assert.equal(baseline.ok, true)
  assert.equal(replacement.ok, true)
  assert.equal(baseline.rows.length, 14)
  assert.deepEqual(summarizeRows(baseline.rows), {
    debitTotal: expected.baseline.debits,
    creditTotal: expected.baseline.credits,
    signedTotal: '0.00',
    profit: expected.baseline.profit,
    netPpe: expected.baseline.netPpe,
    assets: expected.baseline.assets,
    liabilities: expected.baseline.liabilities,
    equity: expected.baseline.equity,
  })
  assert.deepEqual(summarizeRows(replacement.rows), {
    debitTotal: expected.afterAj001.debits,
    creditTotal: expected.afterAj001.credits,
    signedTotal: '0.00',
    profit: expected.afterAj001.profit,
    netPpe: expected.afterAj001.netPpe,
    assets: expected.afterAj001.assets,
    liabilities: expected.afterAj001.liabilities,
    equity: expected.afterAj001.equity,
  })
  assert.equal(sourceReflection(baseline.rows, replacement.rows, expected.aj001), 'REFLECTED')
})

test('accounting intake rejects unsafe or ambiguous source rows', () => {
  const baseline = fixture('baseline_tb.csv')
  assert.equal(parseCsv('', { entityId: 'CLI-0009', period: 'FY2026', currency: 'QAR' }).code, 'EMPTY_SOURCE')
  assert.equal(parseCsv(baseline, { entityId: 'CLI-0009', period: 'FY2026' }).code, 'SOURCE_METADATA_REQUIRED')
  assert.equal(parseCsv(baseline, { entityId: 'CLI-0009', period: 'FY2026', currency: 'Qatar' }).code, 'CURRENCY_INVALID')
  assert.equal(parseCsv(baseline.replace('100101,Bank', '100101,=SUM(Bank)'), { entityId: 'CLI-0009', period: 'FY2026', currency: 'QAR' }).code, 'FORMULA_INPUT')
  assert.equal(parseCsv(baseline.replace('300100,Share capital', '300100,Share capital').replace('200100,Trade payables', '200100,=SUM(Trade payables)'), { entityId: 'CLI-0009', period: 'FY2026', currency: 'QAR' }).code, 'FORMULA_INPUT')
  assert.equal(parseCsv(baseline.replace('150000.00,0.00', '-1.00,0.00'), { entityId: 'CLI-0009', period: 'FY2026', currency: 'QAR' }).code, 'SIGN_CONVENTION_INVALID')
  assert.equal(parseCsv(`${baseline.trimEnd()}\n100101,Bank,Cash,0.00,0.00`, { entityId: 'CLI-0009', period: 'FY2026', currency: 'QAR' }).code, 'DUPLICATE_SOURCE_ROW')
  assert.equal(parseCsv(baseline.replace('150000.00,0.00', '150001.00,0.00'), { entityId: 'CLI-0009', period: 'FY2026', currency: 'QAR' }).code, 'UNBALANCED_SOURCE')
  const partial = fixtureRows(baselineFixture)
  const changed = fixtureRows(replacementFixture)
  changed[12].debit = '23000.00'
  assert.equal(sourceReflection(partial, changed), 'PARTIALLY_REFLECTED')
  assert.equal(sourceReflection(partial, partial), 'NOT_REFLECTED')
  assert.equal(sourceReflection([], changed), 'UNKNOWN')
  assert.equal(sourceReflection(partial.filter((row) => row.accountCode !== '520100'), changed), 'UNKNOWN')
})

test('money operations use exact base-10 values and reject floats', () => {
  assert.equal(addMoney('0.10', '0.20'), '0.30')
  assert.equal(sumMoney(['1000000.01', '0.09']), '1000000.10')
  assert.equal(moneyString(5000), '5000.00')
  assert.equal(compareMoney('175000.00', '175000.00'), 0)
  assert.throws(() => moneyString(0.1 + 0.2), /canonical decimal strings or safe integers/)
  assert.throws(() => moneyString('NaN'), /finite base-10/)
})

test('journal revisions cannot double-apply a logical adjustment', () => {
  const first = registerJournalRevision([], { id: 'AJ-001-R1', logicalJournalId: 'AJ-001', layer: 'REPORTING', state: 'OPERATIVE' }, { reflection: 'NOT_REFLECTED' })
  assert.equal(first.ok, true)
  const duplicate = registerJournalRevision(first.revisions, { id: 'AJ-001-R2', logicalJournalId: 'AJ-001', layer: 'REPORTING', state: 'OPERATIVE' }, { reflection: 'NOT_REFLECTED' })
  assert.equal(duplicate.code, 'DUPLICATE_LOGICAL_REVISION')
  assert.equal(registerJournalRevision(first.revisions, { id: 'AJ-001-R3', logicalJournalId: 'AJ-001', layer: 'REPORTING' }, { reflection: 'REFLECTED' }).code, 'SOURCE_ALREADY_REFLECTED')
  assert.equal(registerJournalRevision(first.revisions, { id: 'AJ-001-R4', logicalJournalId: 'AJ-001', layer: 'REPORTING' }, { reflection: 'UNKNOWN' }).code, 'SOURCE_REFLECTION_UNKNOWN')
})
