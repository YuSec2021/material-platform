import type { ReactNode } from "react";
import { Badge } from "../ui/badge";
import { cn } from "../ui/utils";

interface StatusBadgeProps {
  status: "normal" | "stop-purchase" | "stop-use" | "draft" | "pending" | "approved" | "rejected";
  children: ReactNode;
}

const statusConfig = {
  normal: "border-success/30 bg-success/10 text-success",
  "stop-purchase": "border-warning/30 bg-warning/10 text-warning-foreground",
  "stop-use": "border-muted-foreground/30 bg-muted text-muted-foreground",
  draft: "border-info/30 bg-info/10 text-info",
  pending: "border-warning/30 bg-warning/10 text-warning-foreground",
  approved: "border-success/30 bg-success/10 text-success",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function StatusBadge({ status, children }: StatusBadgeProps) {
  return <Badge variant="outline" className={cn("font-medium", statusConfig[status])}>{children}</Badge>;
}
