/** 底部导航用的小图标（原创 SVG，线条风格，跟随 currentColor） */
export function NavIcon({ name, size = 18 }: { name: 'cards' | 'book' | 'history' | 'gear'; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'cards':
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="11" height="15" rx="2" />
          <path d="M8.5 5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-1" />
          <path d="M6.5 9.5h5" />
        </svg>
      );
    case 'book':
      return (
        <svg {...common}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
          <path d="M4 5.5v15" />
          <path d="M8 7.5h7" />
        </svg>
      );
    case 'history':
      return (
        <svg {...common}>
          <path d="M3.5 12a8.5 8.5 0 1 0 3-6.5" />
          <path d="M3.5 4.5V9h4.5" />
          <path d="M12 8v4.5l3 2" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1" />
        </svg>
      );
    default:
      return null;
  }
}
