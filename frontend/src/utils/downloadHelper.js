import { startActivity } from './networkActivity';
const activeDownloads = new Map();
let tokenProvider = async () => null;
export const setDownloadTokenProvider = provider => { tokenProvider = provider || (async () => null); };
/**
 * Downloads a file safely from any URL (specifically handling cross-origin Cloudinary PDFs/images)
 * using the backend proxy download endpoint to guarantee authentic browser download dialogs
 * without CORS errors or 401 unsigned transformation errors.
 */
export const downloadFile = (fileUrl, filename = 'download') => {
  if (activeDownloads.has(fileUrl)) return activeDownloads.get(fileUrl);
  const work = performDownload(fileUrl, filename).finally(() => activeDownloads.delete(fileUrl));
  activeDownloads.set(fileUrl, work);
  return work;
};
const performDownload = async (fileUrl, filename) => {
  if (!fileUrl) return;
  const finish = startActivity('Preparing download…');

  try {
    const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const safeName = filename || 'document.pdf';
    const proxyUrl = `${API}/api/materials/proxy-download?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(safeName)}`;

    const token = await tokenProvider();
    if (!token) throw new Error('Please sign in to download resources');
    const response = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) {
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      return;
    }

    // Handle upstream errors gracefully (e.g. Cloudinary PDF delivery setting)
    let errorMsg = 'Failed to download file from storage.';
    try {
      const errorJson = await response.json();
      if (errorJson?.error) errorMsg = errorJson.error;
    } catch { /* No cached value is available; use the normal loading path. */ }

    console.warn('Download notice:', errorMsg);
    alert(`📁 Download Notice:\n${errorMsg}`);
  } catch (err) {
    console.error('Download failed:', err);
    alert(err.message || 'Unable to download. Please retry.');
  } finally { finish(); }
};
