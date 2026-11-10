import { useState } from 'react'

// Render large collections in small batches; filtering still considers every item.
export default function ProgressiveList({ items, children, pageSize = 20 }) {
  const [limit, setLimit] = useState(pageSize)
  return <>{children(items.slice(0, limit))}{items.length > limit &&
    <button type="button" className="btn btn-secondary list-more" onClick={() => setLimit(value => value + pageSize)}>
      Show more ({items.length - limit} remaining)
    </button>}</>
}
