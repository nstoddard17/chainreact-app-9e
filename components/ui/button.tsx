import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md active:bg-blue-800",
        primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md active:bg-blue-800",
        destructive:
          "bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 hover:border-red-600 shadow-sm",
        outline:
          "border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 shadow-sm",
        secondary:
          "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 hover:border-gray-400",
        ghost: "hover:bg-gray-100 hover:text-gray-900",
        link: "text-blue-600 underline-offset-4 hover:underline hover:text-blue-700",
        success: "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 hover:border-green-300 shadow-sm",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-sm",
        lg: "h-11 px-6 text-base font-semibold",
        xl: "h-12 px-8 text-lg font-semibold",
        icon: "h-10 w-10",
        responsive: "h-9 px-3 text-sm sm:h-10 sm:px-4 sm:text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    // Memoize the className to prevent unnecessary re-renders
    const buttonClassName = React.useMemo(
      () => cn(buttonVariants({ variant, size, className })),
      [variant, size, className]
    )
    return (
      <Comp
        className={buttonClassName}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
