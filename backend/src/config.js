const TIMEZONE = process.env.TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone

const LOOKBACK_DAYS = parseInt(process.env.LOOKBACK_DAYS || '7', 10)

function toSummaryDate(unixTimestamp) {
  return new Date(unixTimestamp * 1000).toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

function lookbackTimestamp(days = LOOKBACK_DAYS) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

module.exports = { TIMEZONE, LOOKBACK_DAYS, toSummaryDate, lookbackTimestamp }
