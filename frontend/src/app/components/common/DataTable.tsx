import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { cn } from "../ui/utils";

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
}

const widthClasses: Record<string, string> = {
  "110px": "w-[110px]",
  "120px": "w-[120px]",
  "190px": "w-[190px]",
};

export function DataTable<T extends { id: string | number }>({
  data,
  columns,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  emptyMessage = "暂无数据",
}: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            {columns.map((column, index) => (
              <TableHead key={`${column.header}-${index}`} className={cn("px-6", column.width && widthClasses[column.width])}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row) => (
              <TableRow key={row.id}>
                {columns.map((column, columnIndex) => (
                  <TableCell key={columnIndex} className="px-6 py-4 text-foreground">
                    {typeof column.accessor === "function" ? column.accessor(row) : String(row[column.accessor])}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between border-t px-6 py-4" aria-label="分页">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            第 {currentPage} 页，共 {totalPages} 页
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onPageChange?.(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="上一页"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onPageChange?.(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="下一页"
            >
              <ChevronRight />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
