import type { ReactNode } from "react";

export const BACKEND_NOT_IMPLEMENTED = "backend not implemented";

type DisabledBackendButtonProps = {
  children: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
};

export function DisabledBackendButton({ children, icon, compact = false }: DisabledBackendButtonProps) {
  const spacing = compact ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm";

  return (
    <span
      className="group relative inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      tabIndex={0}
      title={BACKEND_NOT_IMPLEMENTED}
    >
      <button
        type="button"
        disabled
        aria-label={`${String(children)} ${BACKEND_NOT_IMPLEMENTED}`}
        title={BACKEND_NOT_IMPLEMENTED}
        className={`inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-gray-200 bg-gray-100 text-gray-400 opacity-80 ${spacing}`}
      >
        {icon}
        {children}
      </button>
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block group-focus:block">
        {BACKEND_NOT_IMPLEMENTED}
      </span>
    </span>
  );
}

export function SearchPanel({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <label className="sr-only" htmlFor="standard-search">
        搜索
      </label>
      <input
        id="standard-search"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}
