import '../../utils/installNetworkTracking'
import { useSyncExternalStore } from 'react'
import { getActivity, subscribeActivity } from '../../utils/networkActivity'

export default function NetworkProgress() {
  const activity = useSyncExternalStore(subscribeActivity, getActivity, () => null)
  if (!activity?.mutation) return null
  return <div className={`network-progress is-saving${activity.slow ? ' is-slow' : ''}`} role="status" aria-live="polite">
    <span className="operation-spinner" aria-hidden="true" />
    <span>{activity.label}{activity.slow && <small>Still working. You can keep this page open; avoid submitting again.</small>}</span>
  </div>
}
