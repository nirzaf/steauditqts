import Decimal from 'decimal.js'

// All prototype money values enter this module as canonical base-10 strings.
// Decimal.js is used instead of JavaScript Number so a binary floating-point
// approximation can never authorize a synthetic package.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export const MONEY_SCALE = 2

function sourceString(value) {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  throw new TypeError('Money values must be canonical decimal strings or safe integers.')
}

export function money(value) {
  const raw = sourceString(value)
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) throw new TypeError('Money must be a finite base-10 value with at most two decimal places.')
  const result = new Decimal(raw)
  if (!result.isFinite()) throw new TypeError('Money must be finite.')
  return result
}

export function moneyString(value) {
  return money(value).toFixed(MONEY_SCALE)
}

export function addMoney(...values) {
  return values.reduce((total, value) => total.plus(money(value)), new Decimal(0)).toFixed(MONEY_SCALE)
}

export function subtractMoney(left, right) {
  return money(left).minus(money(right)).toFixed(MONEY_SCALE)
}

export function multiplyMoney(left, right) {
  return money(left).times(money(right)).toFixed(MONEY_SCALE)
}

export function compareMoney(left, right) {
  return money(left).cmp(money(right))
}

export function sumMoney(values) {
  return addMoney(...values)
}
