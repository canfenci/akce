import type { SVGProps } from 'react';

export type IconName = 'home' | 'wallet' | 'plus' | 'target' | 'spark' | 'settings' | 'menu' | 'close' | 'arrow' | 'receipt' | 'chart' | 'check' | 'edit' | 'trash' | 'calendar' | 'card';

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/></>,
  wallet: <><path d="M4 6.5h14a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h12"/><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="m14 10 6-6"/></>,
  spark: <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Zm7 12 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.7-1.7.9-2-2.1-2.1-2 .9-1.7-.7-.7-2h-3l-.7 2-1.7.7-2-.9L1.2 6l.9 2-.7 1.7-2 .7v3l2 .7.7 1.7-.9 2L3.3 20l2-.9 1.7.7.7 2h3l.7-2 1.7-.7 2 .9 2.1-2.1-.9-2 .7-1.7 2-.7Z" transform="translate(2) scale(.83)"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
  arrow: <path d="m9 18 6-6-6-6"/>, receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,   check: <path d="m5 12 4 4L19 6"/>, edit: <><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></>, trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>, card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></>,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
