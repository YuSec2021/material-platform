import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { cn } from "../ui/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

/** Backwards-compatible application modal powered by the shadcn Dialog primitive. */
export function Modal({ isOpen, onClose, title, children, footer, size = "md" }: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className={cn("flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0", sizeClasses[size])}
      >
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
        {footer ? <DialogFooter className="border-t px-6 py-4">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
