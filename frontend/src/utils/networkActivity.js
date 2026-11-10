
const listeners = new Set()
const requests = new Map()
let nextId = 0
let snapshot = null
const publish = () => {
  const items = [...requests.values()]
  snapshot = items.find(item => item.mutation) || items[0] || null
  listeners.forEach(listener => listener())
}
export const subscribeActivity = listener => { listeners.add(listener); return () => listeners.delete(listener) }
export const getActivity = () => snapshot
export function startActivity(label, mutation = true) {
  const id = ++nextId
  const visible = setTimeout(() => { requests.set(id, { label, mutation, slow: false }); publish() }, 250)
  const slow = setTimeout(() => { if (requests.has(id)) { requests.set(id, { ...requests.get(id), slow: true }); publish() } }, 8000)
  return () => { clearTimeout(visible); clearTimeout(slow); requests.delete(id); publish() }
}
