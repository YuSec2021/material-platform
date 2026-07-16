import type { ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/components/ui/tooltip";

export const BACKEND_NOT_IMPLEMENTED = "backend not implemented";

type DisabledBackendButtonProps = {
  children: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
};

export function DisabledBackendButton({ children, icon, compact = false }: DisabledBackendButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={`${String(children)} ${BACKEND_NOT_IMPLEMENTED}`}>
          <Button variant="outline" size={compact ? "sm" : "default"} disabled>
            {icon}
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{BACKEND_NOT_IMPLEMENTED}</TooltipContent>
    </Tooltip>
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
    <div className="rounded-lg border border-border bg-card p-4">
      <label className="sr-only" htmlFor="standard-search">
        搜索
      </label>
      <Input
        id="standard-search"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-ring/40"
      />
    </div>
  );
}
