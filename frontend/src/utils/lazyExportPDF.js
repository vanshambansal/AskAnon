import { startActivity } from './networkActivity';
const exportsInFlight = new Map();
let fontsPromise;
async function loadFonts() {
  if (!fontsPromise) fontsPromise = Promise.all(['Regular', 'Bold'].map(async style => {
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/NotoSans-${style}.ttf`);
    if (!response.ok) throw new Error('PDF font could not load. Please retry the export.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(binary);
  })).catch(error => { fontsPromise = null; throw error; });
  return fontsPromise;
}
export function exportSessionPDF(session, questions, insights, options = {}) {
  const key = `${session.id}:${Boolean(options.isTeacher)}`;
  if (exportsInFlight.has(key)) return exportsInFlight.get(key);
  const work = preparePDF(session, questions, insights, options).finally(() => exportsInFlight.delete(key));
  exportsInFlight.set(key, work);
  return work;
}
async function preparePDF(session, questions, insights, options) {
  const finish = startActivity('Preparing lecture PDF…');
  try {
    const module = await import('./exportPDF');
    const [regular, bold] = await loadFonts();
    return module.exportSessionPDF(session, questions, insights, { ...options, fonts: { regular, bold } });
  } catch (error) { alert(error.message || 'Could not export this lecture. Please retry.'); }
  finally { finish(); }
}
