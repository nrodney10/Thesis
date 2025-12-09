import React from 'react';

export default function UnreadBadge({ count }) {
  if (!count) return null;
  const display = count > 99 ? '99+' : count;
  return (
    <span className="ml-2 inline-flex items-center justify-center text-[10px] font-semibold bg-red-600 text-white rounded-full h-5 min-w-[20px] px-1 shadow">
      {display}
    </span>
  );
}
