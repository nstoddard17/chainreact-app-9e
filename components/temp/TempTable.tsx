"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface TempTableProps {
  children: React.ReactNode
  className?: string
}

export function TempTable({ children, className }: TempTableProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.08)]",
        className
      )}
    >
      <table className="min-w-full divide-y divide-slate-200">
        {children}
      </table>
    </div>
  )
}

interface TempTableHeaderProps {
  columns: string[]
}

TempTable.Header = function TempTableHeader({ columns }: TempTableHeaderProps) {
  return (
    <thead className="bg-slate-50">
      <tr>
        {columns.map((column) => (
          <th
            key={column}
            scope="col"
            className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            {column}
          </th>
        ))}
      </tr>
    </thead>
  )
}

interface TempTableBodyProps {
  children: React.ReactNode
}

TempTable.Body = function TempTableBody({ children }: TempTableBodyProps) {
  return <tbody className="divide-y divide-slate-200">{children}</tbody>
}

interface TempTableRowProps {
  children: React.ReactNode
}

TempTable.Row = function TempTableRow({ children }: TempTableRowProps) {
  return <tr className="transition-colors hover:bg-slate-50">{children}</tr>
}

interface TempTableCellProps {
  children: React.ReactNode
  className?: string
}

TempTable.Cell = function TempTableCell({
  children,
  className,
}: TempTableCellProps) {
  return (
    <td className={cn("px-6 py-4 text-sm text-slate-600", className)}>
      {children}
    </td>
  )
}
