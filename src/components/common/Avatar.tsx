import React, { useState } from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ src, name, className = 'w-8 h-8' }) => {
  const [failed, setFailed] = useState(false);

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  if (!src || failed) {
    return (
      <div
        aria-label={name}
        className={`${className} rounded-full flex items-center justify-center font-bold text-[10px] text-[#304C64] bg-white/50 backdrop-blur-md border border-white/80 shadow-xs shrink-0 select-none`}
      >
        {initials || 'RM'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} rounded-full object-cover border border-white/85 shadow-xs shrink-0`}
    />
  );
};
