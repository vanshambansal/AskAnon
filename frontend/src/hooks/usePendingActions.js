import { useRef, useState } from 'react'

// The ref closes the gap before React renders a disabled button.
export default function usePendingActions() {
  const active = useRef(new Set())
  const [pending, setPending] = useState(new Set())
  const run = async (key, work) => {
    if (active.current.has(key)) return
    active.current.add(key)
    setPending(new Set(active.current))
    try { return await work() }
    finally { active.current.delete(key); setPending(new Set(active.current)) }
  }
  return { pending, run }
}
