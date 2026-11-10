const paths = {
  star: 'm12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9L12 3Z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
  code: 'm8 5-7 7 7 7m8-14 7 7-7 7m-3-16-2 18',
  refresh: 'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3',
  upvote: 'm5 12 7-7 7 7M12 5v16',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  message: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
  folder: 'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 0 1 4 19.5v-14A2.5 2.5 0 0 1 6.5 3Z',
  trash: 'M3 6h18M9 6V4h6v2M5 6l1 15h12l1-15M10 10v7m4-7v7',
  copy: 'M9 9h12v12H9zM5 15H3V3h12v2',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  search: 'M21 21l-5-5M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z',
  lecture: 'M3 3h18v13H3zM12 16v5m-5 0 5-5 5 5M7 8h10m-10 4h6',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  check: 'm5 12 4 4L19 6',
  alert: 'm12 3 10 18H2L12 3Zm0 6v4m0 4h.01',
  bookmark: 'M5 3h14v18l-7-4-7 4V3Z',
  image: 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.01',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  chart: 'M4 3v18h17M8 16v-5m5 5V7m5 9v-3',
  shield: 'm12 3 9 4v6c0 5-9 9-9 9s-9-4-9-9V7l9-4Zm-4 9 3 3 5-6',
}

export default function Icon({ name = 'message', className = '' }) {
  return <svg className={`app-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name] || paths.message} /></svg>
}
