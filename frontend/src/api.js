const BASE = '/api'

export async function fetchGroups() {
  const res = await fetch(`${BASE}/groups`)
  if (!res.ok) throw new Error('Failed to fetch groups')
  return res.json()
}

export async function fetchActions(status = 'pending') {
  const res = await fetch(`${BASE}/actions?status=${status}`)
  if (!res.ok) throw new Error('Failed to fetch actions')
  return res.json()
}

export async function triggerSummarize() {
  const res = await fetch(`${BASE}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  })
  if (!res.ok) throw new Error('Failed to trigger summarize')
  return res.json()
}

export async function submitActionDecision(id, decision, text = null) {
  const res = await fetch(`${BASE}/actions/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, text }),
  })
  if (!res.ok) throw new Error('Failed to submit decision')
  return res.json()
}

export async function fetchGroupSummaries(chatJid, days) {
  const res = await fetch(`${BASE}/groups/${encodeURIComponent(chatJid)}/summaries?days=${days}`)
  if (!res.ok) throw new Error('Failed to fetch summaries')
  return res.json()
}

export async function enableGroup(chatJid, enabled = true) {
  const res = await fetch(`${BASE}/groups/${encodeURIComponent(chatJid)}/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) throw new Error('Failed to update group')
  return res.json()
}
