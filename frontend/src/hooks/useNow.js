import { useEffect, useState } from 'react'

// Relative-time labels tick while a page is open instead of reading the clock during render.
export default function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  return now
}
