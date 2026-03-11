import { useAuth } from '@clerk/clerk-react'
import { useState } from 'react'

export default function TokenPage() {
  const { getToken } = useAuth()
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState(false)

  const grab = async () => {
    const t = await getToken()
    setToken(t)
    navigator.clipboard.writeText(t)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ padding: 40, fontFamily: 'monospace', background: '#0a0f0d', minHeight: '100vh', color: '#e8f0ec' }}>
      <h2 style={{ marginBottom: 8, color: '#f0b429' }}>Token Generator</h2>
      <p style={{ marginBottom: 20, color: '#5a7a68', fontSize: 13 }}>
        Tokens expire in ~60 seconds. Click the button again to get a fresh one.
      </p>
      <button onClick={grab} style={{
        padding: '10px 24px', background: '#f0b429', color: '#0a0f0d',
        border: 'none', borderRadius: 8, fontWeight: 700,
        fontSize: 14, cursor: 'pointer', marginBottom: 20
      }}>
        {copied ? '✓ Copied to clipboard!' : 'Get Fresh Token'}
      </button>
      {token && (
        <textarea readOnly value={token} style={{
          width: '100%', height: 160, background: '#1a2820',
          border: '1px solid #2a3f34', borderRadius: 8,
          color: '#9db8a8', fontSize: 11, padding: 12,
          fontFamily: 'monospace', resize: 'none'
        }} />
      )}
      <p style={{ marginTop: 16, color: '#5a7a68', fontSize: 12 }}>
        In Postman → Headers → <code style={{ color: '#f0b429' }}>Authorization: Bearer {'<paste token>'}</code>
      </p>
    </div>
  )
}