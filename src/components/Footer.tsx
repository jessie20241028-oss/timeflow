import React from 'react';
import { AUTHOR_EMAIL, AUTHOR_NAME, COPYRIGHT_TEXT } from '../constants/branding';

interface FooterProps {
  variant?: 'page' | 'schedule';
  hideOnPrint?: boolean;
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({
  variant = 'page',
  hideOnPrint = false,
  className = '',
}) => {
  const isSchedule = variant === 'schedule';

  return (
    <footer
      className={`${
        isSchedule
          ? 'mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5 print:mt-4 print:rounded-none print:border-x-0 print:border-b-0 print:border-t print:border-slate-300'
          : 'mt-auto border-t border-slate-200 bg-white/80 px-4 py-5 sm:px-6 lg:px-8'
      } ${hideOnPrint ? 'print:hidden' : ''} text-center text-xs text-slate-400 ${className}`}
    >
      <p className="leading-relaxed">
        Created by <strong className="font-semibold text-slate-500">{AUTHOR_NAME}</strong>
        <span className="mx-1.5 text-slate-300" aria-hidden="true">
          |
        </span>
        <span>Contact: </span>
        <a
          href={`mailto:${AUTHOR_EMAIL}`}
          className="text-blue-600 transition-colors hover:text-blue-700 hover:underline break-all sm:break-normal"
        >
          {AUTHOR_EMAIL}
        </a>
      </p>
      <p className="mt-1 text-[11px] text-slate-400">{COPYRIGHT_TEXT}</p>
    </footer>
  );
};
