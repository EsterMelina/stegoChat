const paths: Record<string, React.ReactNode> = {
  document: <><path d="M14 2H5v20h14V7l-5-5ZM14 2v6h5M8 12h8M8 16h8"/></>,
  chat: <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5a10 10 0 0 1 20 0Z"/><path d="M7 9h8M7 13h5"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  send: <><path d="m3 3 19 9-19 9 3-9-3-9ZM6 12h16"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/></>,
  logout: <><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  edit: <><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z"/></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  "eye-off": <><path d="m3 3 18 18"/><path d="M10.6 5.2A10.7 10.7 0 0 1 12 5c6 0 10 7 10 7a18.8 18.8 0 0 1-3.1 4.1M6.2 6.2C3.6 8 2 12 2 12s4 7 10 7a9.8 9.8 0 0 0 3.8-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
  back: <path d="m14 5-7 7 7 7"/>,
  check: <path d="m5 12 4 4L20 5"/>,
};
export default function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.chat}</svg>;
}
