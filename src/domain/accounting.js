import { addMoney, moneyString, subtractMoney, sumMoney } from './money.js'

export const ACCOUNTING_FIXTURE_VERSION = 'TB-FIXTURE-2026-01'
export const MAX_CSV_BYTES = 2_000_000
export const MAX_CSV_ROWS = 5_000
export const MAX_CSV_CELL_LENGTH = 240
export const baselineFixture = [
  ['100101', 'Bank', 'Cash', '150000.00', '0.00'],
  ['110100', 'Trade receivables', 'Receivables', '300000.00', '0.00'],
  ['120100', 'Inventory', 'Inventory', '200000.00', '0.00'],
  ['150100', 'PPE cost', 'Fixed assets', '150000.00', '0.00'],
  ['159100', 'Accumulated depreciation', 'Fixed assets', '0.00', '50000.00'],
  ['200100', 'Trade payables', 'Payables', '0.00', '240000.00'],
  ['220100', 'Loan', 'Non-current liabilities', '0.00', '30000.00'],
  ['300100', 'Share capital', 'Equity', '0.00', '250000.00'],
  ['310100', 'Opening retained earnings', 'Equity', '0.00', '50000.00'],
  ['400100', 'Revenue', 'Revenue', '0.00', '1200000.00'],
  ['500100', 'Cost of sales', 'Cost of sales', '800000.00', '0.00'],
  ['510100', 'Payroll expense', 'Operating expenses', '190000.00', '0.00'],
  ['520100', 'Depreciation expense', 'Fixed assets', '20000.00', '0.00'],
  ['530100', 'Finance costs', 'Finance', '10000.00', '0.00'],
]

export const replacementFixture = baselineFixture.map((row) => [...row])
replacementFixture[4] = ['159100', 'Accumulated depreciation', 'Fixed assets', '0.00', '55000.00']
replacementFixture[12] = ['520100', 'Depreciation expense', 'Fixed assets', '25000.00', '0.00']

export function fixtureRows(rows = baselineFixture, { entityId = 'CLI-0018', period = 'FY2026', currency = 'QAR', sourceId = 'TB-BASELINE-001' } = {}) {
  return rows.map(([code, account, area, debit, credit], index) => ({
    sourceRowId: `${sourceId}-${String(index + 1).padStart(2, '0')}`,
    accountCode: code,
    account,
    area,
    entityId,
    period,
    currency,
    debit: moneyString(debit),
    credit: moneyString(credit),
    signed: subtractMoney(credit, debit),
  }))
}

export function parseCsv(csv, { entityId, period, currency, sourceId = 'TB-CSV' } = {}) {
  if (typeof csv !== 'string' || !csv.trim()) return { ok: false, code: 'EMPTY_SOURCE', message: 'CSV source is empty.' }
  if (!String(entityId || '').trim() || !String(period || '').trim() || !String(currency || '').trim()) return { ok: false, code: 'SOURCE_METADATA_REQUIRED', message: 'Entity, reporting period and ISO currency are required before intake.' }
  if (!/^[A-Z]{3}$/.test(String(currency))) return { ok: false, code: 'CURRENCY_INVALID', message: 'Currency must be a three-letter uppercase code.' }
  if (new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) return { ok: false, code: 'SOURCE_TOO_LARGE', message: `CSV intake is limited to ${MAX_CSV_BYTES} bytes in this prototype.` }
  const lines = csv.trim().split(/\r?\n/)
  const header = lines.shift().split(',').map((cell) => cell.trim())
  const expected = ['account_code', 'account_name', 'area', 'debit', 'credit']
  if (header.join('|') !== expected.join('|')) return { ok: false, code: 'UNSUPPORTED_SCHEMA', message: 'CSV must use account_code, account_name, area, debit, credit columns.' }
  const formulaLike = (cell) => /^[=+@]/.test(cell.trim()) || /^-\s*(?:=|\+|@)/.test(cell.trim())
  if (lines.some((line) => line.split(',').some(formulaLike))) return { ok: false, code: 'FORMULA_INPUT', message: 'Formula-like CSV input is not accepted.' }
  if (lines.length > MAX_CSV_ROWS) return { ok: false, code: 'ROW_LIMIT_EXCEEDED', message: `CSV intake is limited to ${MAX_CSV_ROWS} data rows in this prototype.` }
  const rows = []
  const keys = new Set()
  for (const [index, line] of lines.entries()) {
    const cells = line.split(',').map((cell) => cell.trim())
    if (cells.length !== expected.length) return { ok: false, code: 'ROW_SHAPE_INVALID', message: `Row ${index + 2} has an unexpected number of columns.` }
    if (cells.some((cell) => cell.length > MAX_CSV_CELL_LENGTH)) return { ok: false, code: 'CELL_LIMIT_EXCEEDED', message: `Row ${index + 2} contains a cell longer than ${MAX_CSV_CELL_LENGTH} characters.` }
    const [accountCode, account, area, debit, credit] = cells
    if (!/^\d{1,20}$/.test(accountCode) || !account || !area) return { ok: false, code: 'ROW_INVALID', message: `Row ${index + 2} has an invalid account identity.` }
    if (/^-/.test(debit) || /^-/.test(credit)) return { ok: false, code: 'SIGN_CONVENTION_INVALID', message: `Row ${index + 2} must use non-negative debit and credit columns.` }
    if (keys.has(accountCode)) return { ok: false, code: 'DUPLICATE_SOURCE_ROW', message: `Account ${accountCode} appears more than once.` }
    keys.add(accountCode)
    try {
      rows.push({ sourceRowId: `${sourceId}-${String(index + 1).padStart(2, '0')}`, accountCode, account, area, entityId, period, currency, debit: moneyString(debit), credit: moneyString(credit), signed: subtractMoney(credit, debit) })
    } catch (error) {
      return { ok: false, code: 'MONEY_INVALID', message: `Row ${index + 2}: ${error.message}` }
    }
  }
  const debitTotal = sumMoney(rows.map((row) => row.debit))
  const creditTotal = sumMoney(rows.map((row) => row.credit))
  if (debitTotal !== creditTotal) return { ok: false, code: 'UNBALANCED_SOURCE', message: `Debit ${debitTotal} does not equal credit ${creditTotal}.` }
  return { ok: true, rows, source: { sourceId, entityId, period, currency, debitTotal, creditTotal, signedTotal: sumMoney(rows.map((row) => row.signed)) } }
}

export function summarizeRows(rows) {
  const debitTotal = sumMoney(rows.map((row) => row.debit))
  const creditTotal = sumMoney(rows.map((row) => row.credit))
  const byCode = Object.fromEntries(rows.map((row) => [row.accountCode, row]))
  const revenue = byCode['400100']?.credit || '0.00'
  const expenses = sumMoney(['500100', '510100', '520100', '530100'].map((code) => byCode[code]?.debit || '0.00'))
  const profit = subtractMoney(revenue, expenses)
  const assets = sumMoney(['100101', '110100', '120100', '150100'].map((code) => byCode[code]?.debit || '0.00'))
  const accumulatedDepreciation = byCode['159100']?.credit || '0.00'
  const netPpe = subtractMoney(byCode['150100']?.debit || '0.00', accumulatedDepreciation)
  const liabilities = sumMoney(['200100', '220100'].map((code) => byCode[code]?.credit || '0.00'))
  const equity = sumMoney(['300100', '310100'].map((code) => byCode[code]?.credit || '0.00').concat(profit))
  return { debitTotal, creditTotal, signedTotal: subtractMoney(creditTotal, debitTotal), profit, netPpe, assets: subtractMoney(assets, accumulatedDepreciation), liabilities, equity }
}

/**
 * Return truthful mapping coverage for the selected source rows. The
 * denominator is the rows actually in the selected dataset, not the size of
 * a global mapping catalogue; an unknown code is therefore visibly unmapped.
 */
export function mappingSummary(rows = [], mappings = {}) {
  const selected = Array.isArray(rows) ? rows : []
  const mappedRows = selected.filter((row) => {
    const destination = mappings?.[row?.accountCode]
    return typeof destination === 'string' && destination.trim().length > 0
  })
  return {
    required: selected.length,
    mapped: mappedRows.length,
    unmapped: selected.length - mappedRows.length,
    coveragePercent: selected.length ? Math.round((mappedRows.length / selected.length) * 100) : 0,
    state: mappedRows.length === selected.length ? 'REVIEWED' : 'REVIEW_REQUIRED',
  }
}

export function sourceReflection(baselineRows, replacementRows, adjustment = { debitAccount: '520100', creditAccount: '159100', amount: '5000.00' }) {
  if (!Array.isArray(baselineRows) || !Array.isArray(replacementRows) || !baselineRows.length || !replacementRows.length) return 'UNKNOWN'
  const baseline = Object.fromEntries(baselineRows.map((row) => [row.accountCode, row]))
  const replacement = Object.fromEntries(replacementRows.map((row) => [row.accountCode, row]))
  if (!baseline[adjustment.debitAccount] || !baseline[adjustment.creditAccount] || !replacement[adjustment.debitAccount] || !replacement[adjustment.creditAccount]) return 'UNKNOWN'
  const debitDelta = subtractMoney(replacement[adjustment.debitAccount]?.debit || '0.00', baseline[adjustment.debitAccount]?.debit || '0.00')
  const creditDelta = subtractMoney(replacement[adjustment.creditAccount]?.credit || '0.00', baseline[adjustment.creditAccount]?.credit || '0.00')
  if (debitDelta === '0.00' && creditDelta === '0.00') return 'NOT_REFLECTED'
  if (debitDelta === moneyString(adjustment.amount) && creditDelta === moneyString(adjustment.amount)) return 'REFLECTED'
  return 'PARTIALLY_REFLECTED'
}

/**
 * Keep one operative logical journal revision per accounting layer. The
 * function is deliberately pure so a page or command handler can show the
 * denial before mutating shared scenario state.
 */
export function registerJournalRevision(revisions = [], revision, { reflection = 'UNKNOWN', layer = revision?.layer || 'REPORTING' } = {}) {
  if (!revision || !revision.id || !revision.logicalJournalId) return { ok: false, code: 'JOURNAL_INVALID', message: 'A journal revision needs an id and logical journal id.', revisions }
  if (reflection === 'REFLECTED') return { ok: false, code: 'SOURCE_ALREADY_REFLECTED', message: 'The replacement source already contains this adjustment; do not apply it again.', revisions }
  if (reflection !== 'NOT_REFLECTED') return { ok: false, code: 'SOURCE_REFLECTION_UNKNOWN', message: 'Journal application is blocked until source reflection is NOT_REFLECTED.', revisions }
  if (revisions.some((item) => item.id === revision.id)) return { ok: false, code: 'JOURNAL_REVISION_EXISTS', message: 'That journal revision already exists.', revisions }
  if (revisions.some((item) => item.logicalJournalId === revision.logicalJournalId && item.layer === layer && item.state === 'OPERATIVE')) return { ok: false, code: 'DUPLICATE_LOGICAL_REVISION', message: 'Only one operative revision is allowed for a logical journal and layer.', revisions }
  const next = [...revisions, { ...revision, layer, state: revision.state || 'PROPOSED', reflection }]
  return { ok: true, code: 'JOURNAL_REVISION_REGISTERED', message: 'Journal revision registered without changing the source.', revisions: next }
}
