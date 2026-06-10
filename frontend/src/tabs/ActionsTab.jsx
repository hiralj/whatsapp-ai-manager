import { useState, useEffect, useCallback } from 'react'
import { fetchActions, submitActionDecision } from '../api'

const ACTION_LABELS = {
  birthday_greeting: '🎂 Birthday Greeting',
  congratulations: '🎊 Congratulations',
  anniversary: '🌸 Anniversary',
  condolence: '🙏 Condolence',
}

export default function ActionsTab() {
  const [actions, setActions] = useState([])
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchActions('pending')
      setActions(data)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [load])

  async function handleDecision(id, decision, text) {
    try {
      await submitActionDecision(id, decision, text)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Pending Actions</h2>
        <span className="text-sm text-gray-500">
          {actions.length} pending
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {actions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">✓</p>
          <p className="text-sm">No pending actions</p>
        </div>
      ) : (
        <div className="space-y-4">
          {actions.map(action => (
            <ActionCard key={action.id} action={action} onDecision={handleDecision} />
          ))}
        </div>
      )}
    </div>
  )
}

function ActionCard({ action, onDecision }) {
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState(action.draft_text)
  const [busy, setBusy] = useState(false)

  async function submit(decision) {
    setBusy(true)
    await onDecision(action.id, decision, decision === 'edit' ? editText : null)
    setBusy(false)
  }

  const label = ACTION_LABELS[action.action_type] || action.action_type
  let context = []
  try { context = action.context_json ? JSON.parse(action.context_json) : [] } catch (_) {}

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
            {label}
          </span>
          {action.occasion_date && (
            <span className="text-xs text-gray-400">{action.occasion_date}</span>
          )}
        </div>
        <span className="text-xs text-gray-400">{action.display_name || action.chat_jid}</span>
      </div>

      {context.length > 0 && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600 mb-1">Triggered by:</p>
          {context.slice(0, 3).map((m, i) => (
            <p key={i}>
              {typeof m === 'string'
                ? m
                : <><span className="font-medium">{m.sender_name}:</span> {m.body}</>}
            </p>
          ))}
          {context.length > 3 && <p>+{context.length - 3} more</p>}
        </div>
      )}

      <p className="text-xs text-gray-500 font-medium mb-1">Draft message:</p>
      {editMode ? (
        <textarea
          className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-800 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
          rows={4}
          value={editText}
          onChange={e => setEditText(e.target.value)}
        />
      ) : (
        <p className="text-gray-800 text-sm leading-relaxed mb-4 bg-indigo-50 p-3 rounded-lg">
          {action.draft_text}
        </p>
      )}

      <div className="flex gap-2">
        {!editMode ? (
          <>
            <button
              onClick={() => submit('approve')}
              disabled={busy}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
            >
              Approve & Send
            </button>
            <button
              onClick={() => setEditMode(true)}
              disabled={busy}
              className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              Edit
            </button>
            <button
              onClick={() => submit('reject')}
              disabled={busy}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition"
            >
              Reject
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => submit('edit')}
              disabled={busy || !editText.trim()}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
            >
              Send Edited
            </button>
            <button
              onClick={() => setEditMode(false)}
              disabled={busy}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
