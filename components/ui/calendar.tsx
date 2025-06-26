"use client"

// Updated calendar with navigation arrows in top right and theme support

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 bg-background text-foreground", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex items-center justify-between px-2 pt-2",
        caption_label: "text-sm font-semibold text-foreground",
        nav: "flex items-center space-x-1",
        nav_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 hover:bg-accent text-foreground dark:text-white"
        ),
        nav_button_previous: "",
        nav_button_next: "",
        table: "w-full border-collapse",
        head_row: "grid grid-cols-7 w-full",
        head_cell:
          "text-muted-foreground font-normal text-[0.8rem] text-center flex items-center justify-center py-2",
        row: "grid grid-cols-7 w-full",
        cell: "h-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 flex items-center justify-center",
        day: "h-9 w-9 p-0 font-normal text-center text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 inline-flex items-center justify-center text-foreground",
        day_range_end: "day-range-end",
        day_selected:
          "bg-teal-600 text-white hover:bg-teal-700 hover:text-white focus:bg-teal-600 focus:text-white !rounded-full shadow-sm",
        day_today: "bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100 !rounded-full",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
