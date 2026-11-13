import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact = false, className = '' }) => {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        fill="none"
        className={`${compact ? 'h-8 w-8' : 'h-9 w-9'} shrink-0`}
        aria-hidden="true"
      >
        <rect width="512" height="512" rx="116" fill="#2563EB" />
        <circle
          cx="256"
          cy="256"
          r="152"
          stroke="#FFFFFF"
          strokeWidth="28"
          strokeOpacity="0.95"
        />
        <path
          d="M256 108V142M404 256H370M256 404V370M108 256H142"
          stroke="#FFFFFF"
          strokeWidth="26"
          strokeLinecap="round"
          strokeOpacity="0.88"
        />
        <path
          d="M196 258L240 302L328 204"
          stroke="#FFFFFF"
          strokeWidth="34"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="flex min-w-0 flex-col leading-none">
        <span
          className={`font-display font-bold tracking-tight text-slate-900 whitespace-nowrap ${
            compact ? 'text-[15px]' : 'text-base'
          }`}
        >
          TimeFlow
        </span>
        <span className="mt-1 text-[11px] font-medium tracking-wide text-slate-400 whitespace-nowrap">
          Plan · Focus · Grow
        </span>
      </div>
    </div>
  );
};
