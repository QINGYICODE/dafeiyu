'use client';

export function Character({ className = '', mood = '平静', small = false }: { className?: string; mood?: string; small?: boolean }) {
  return <img
    className={`companion-art ${small ? 'companion-portrait' : 'companion-full'} ${className}`}
    src={`/characters/dafeiyu-${small ? 'avatar' : 'full'}-v1.webp`}
    alt={`大肥鱼，心情${mood}`}
    width={small ? 512 : 768}
    height={small ? 512 : 1024}
    decoding="async"
    draggable={false}
  />;
}
