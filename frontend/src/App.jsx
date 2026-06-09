import { useState, Component } from 'react'
import DigestTab from './tabs/DigestTab'
import ActionsTab from './tabs/ActionsTab'

// Catches render errors within a tab so a crash shows an inline message
// instead of blanking the whole app. Example: bad JSON in ActionsTab.
class TabErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(err) { return { error: err } }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-red-600 text-sm bg-red-50 rounded-lg border border-red-200">
          Something went wrong in this tab: {this.state.error.message}
        </div>
      )
    }
    return this.props.children
  }
}

const TABS = [
  { id: 'digest', label: 'Digest' },
  { id: 'actions', label: 'Actions' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('digest')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <span className="text-2xl">💬</span>
        <h1 className="text-lg font-bold text-gray-800">WhatsApp Manager</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="flex border-b border-gray-200 mb-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'digest' && <TabErrorBoundary key="digest"><DigestTab /></TabErrorBoundary>}
        {activeTab === 'actions' && <TabErrorBoundary key="actions"><ActionsTab /></TabErrorBoundary>}
      </div>
    </div>
  )
}
