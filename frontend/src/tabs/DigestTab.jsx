import { useState, useEffect, useCallback } from 'react'
import { fetchGroups, fetchGroupSummaries, triggerSummarize, enableGroup } from '../api'

// formatDate('2026-06-09') → 'Tue, Jun 9'
function formatDate(dateStr) {
  // append time to avoid UTC midnight shifting the date back one day
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default function DigestTab() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchGroups()
      setGroups(data)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [load])

  async function handleSummarize() {
    setSummarizing(true)
    setError(null)
    try {
      await triggerSummarize()
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSummarizing(false)
    }
  }

  async function handleToggle(chatJid, currentEnabled) {
    try {
      await enableGroup(chatJid, !currentEnabled)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const enabledGroups = groups.filter(g => g.summarize_enabled)
  const otherGroups = groups.filter(g => !g.summarize_enabled)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Daily Digest</h2>
        <button
          onClick={handleSummarize}
          disabled={summarizing || enabledGroups.length === 0}
          className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {summarizing ? 'Summarizing…' : 'Summarize Today'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {enabledGroups.length === 0 && !loading && (
        <p className="text-gray-500 text-sm mb-6">
          No groups enabled. Toggle groups below to start summarizing.
        </p>
      )}

      {enabledGroups.length > 0 && (
        <div className="space-y-4 mb-8">
          {enabledGroups.map(g => (
            <GroupCard key={g.chat_jid} group={g} onToggle={handleToggle} />
          ))}
        </div>
      )}

      {otherGroups.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Available Groups
          </h3>
          <div className="space-y-2">
            {otherGroups.map(g => (
              <div key={g.chat_jid} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-gray-700 text-sm">{g.display_name || g.chat_jid}</span>
                <button
                  onClick={() => handleToggle(g.chat_jid, false)}
                  className="text-xs px-3 py-1 bg-white border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition"
                >
                  Enable
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const RANGES = [
  { key: 'today', label: 'Today',  days: 1 },
  { key: '3d',    label: '3 days', days: 3 },
  { key: '7d',    label: '1 week', days: 7 },
]

// Single group card with Today / 3 days / 1 week range toggle.
// "Today" uses the summary already in props; other ranges fetch on first
// click and cache in local state to avoid re-fetching on toggle.
// Example: clicking "3 days" fetches /api/groups/<jid>/summaries?days=3
// and renders one date-labelled section per day that has a summary.
function GroupCard({ group, onToggle }) {
  const [range, setRange] = useState('today')
  const [cache, setCache] = useState({})   // { '3d': [...], '7d': [...] }
  const [fetching, setFetching] = useState(false)

  // selectRange('3d') — switches view; fetches from API if not yet cached
  async function selectRange(r) {
    setRange(r)
    if (r === 'today' || cache[r]) return
    setFetching(true)
    try {
      const days = RANGES.find(x => x.key === r).days
      const data = await fetchGroupSummaries(group.chat_jid, days)
      setCache(c => ({ ...c, [r]: data }))
    } finally {
      setFetching(false)
    }
  }

  const summaries = range === 'today'
    ? (group.latest_summary ? [group.latest_summary] : [])
    : (cache[range] || [])

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-gray-800">{group.display_name || group.chat_jid}</h3>
        <div className="flex items-center gap-1.5">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => selectRange(r.key)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                range === r.key
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => onToggle(group.chat_jid, true)}
            className="text-xs px-2 py-1 text-gray-400 hover:text-red-500 transition ml-1"
            title="Disable this group"
          >
            Disable
          </button>
        </div>
      </div>

      {fetching ? (
        <p className="text-gray-400 text-sm italic">Loading…</p>
      ) : summaries.length === 0 ? (
        <p className="text-gray-400 text-sm italic">No summary yet — click "Summarize Today" to generate one.</p>
      ) : (
        <div className="space-y-4">
          {[...summaries].reverse().map(s => (
            <div key={s.summary_date}>
              {range !== 'today' && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  {formatDate(s.summary_date)}
                  {s.message_count ? ` · ${s.message_count} msgs` : ''}
                </p>
              )}
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">
                {s.summary_text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
