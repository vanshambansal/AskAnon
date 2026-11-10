import axios from 'axios'
import { invalidateResources } from './resourceCache.mjs'
import { startActivity } from './networkActivity'

function labelFor(config) {
  const url = config.url || ''
  const method = config.method?.toUpperCase() || 'GET'
  if (url.endsWith('/users/sync') && !config.data?.role) return 'Updating workspace…'
  if (method === 'GET') return 'Updating workspace…'
  if (url.includes('check-duplicate')) return 'Checking for similar questions…'
  if (url.endsWith('/ask') || url.includes('ai-insights')) return 'Generating a source-grounded answer…'
  if (url.includes('/upload')) return 'Uploading resource…'
  if (method === 'DELETE' || url.includes('batch-delete')) return 'Deleting…'
  if (url.endsWith('/end')) return 'Concluding lecture…'
  if (method === 'POST' && /\/sessions\/?$/.test(url)) return 'Creating lecture…'
  if (method === 'POST' && /\/questions\/?$/.test(url)) return 'Reviewing and submitting your question…'
  return 'Saving changes…'
}
const requestInterceptor = axios.interceptors.request.use(config => {
  if (!config.timeout) config.timeout = /upload/.test(config.url || '') ? 120000 : 60000
  const mutation = !['get', 'head'].includes(config.method || 'get')
  const readOnlyPost = /check-duplicate|\/ask$|ai-insights/.test(config.url || '')
  const profileRead = config.url?.endsWith('/users/sync') && !config.data?.role
  config.mutatesResources = mutation && !readOnlyPost && !profileRead
  if (config.mutatesResources) invalidateResources()
  config.finishActivity = startActivity(labelFor(config), mutation && !profileRead)
  return config
})
const responseInterceptor = axios.interceptors.response.use(response => {
  response.config.finishActivity?.()
  if (response.config.mutatesResources) invalidateResources()
  return response
}, error => { error.config?.finishActivity?.(); return Promise.reject(error) })
if (import.meta.hot) import.meta.hot.dispose(() => {
  axios.interceptors.request.eject(requestInterceptor)
  axios.interceptors.response.eject(responseInterceptor)
})
