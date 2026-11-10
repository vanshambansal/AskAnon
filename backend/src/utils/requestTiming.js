// Expose operation durations in browser DevTools without logging query text,
// credentials or classroom content. Labels are fixed by controllers.
export async function timeOperation(res, label, work) {
  const started = performance.now();
  try { return await work(); }
  finally {
    if (!res.headersSent && res.setHeader) {
      const previous = res.getHeader?.('Server-Timing');
      const metric = `${label};dur=${(performance.now() - started).toFixed(1)}`;
      res.setHeader('Server-Timing', previous ? `${previous}, ${metric}` : metric);
    }
  }
}
