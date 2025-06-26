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
      className={cn("p-3 bg-background text-foreground w-[286px]", className)}
      classNames={{
        months: "flex flex-col space-y-4",
        month: "space-y-2",
        caption: "flex justify-between items-center pt-1 mb-2 relative",
        caption_label: "text-sm font-semibold text-foreground",
        nav: "flex items-center space-x-1 !absolute !right-0 !top-1",
        nav_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 hover:bg-accent text-foreground dark:text-white"
        ),
        nav_button_previous: "",
        nav_button_next: "",
        table: "w-full border-collapse border-spacing-0",
        head_row: "flex w-full",
        head_cell:
          "text-muted-foreground font-normal text-[0.8rem] w-9 rounded-md flex items-center justify-center py-2",
        row: "flex w-full mt-1",
        cell: "text-center text-sm p-0 relative focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        day: "h-9 w-9 p-0 font-normal flex items-center justify-center transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        day_range_end: "day-range-end",
        day_selected:
          "bg-teal-600 text-white hover:bg-teal-700 hover:text-white focus:bg-teal-600 focus:text-white rounded-full shadow-sm",
        day_today: "bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100 rounded-full",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" {...props} />,
        IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" {...props} />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
