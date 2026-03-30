import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-medium tracking-[-0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
          "border-[color:var(--primary-border)] bg-primary text-primary-foreground shadow-xs hover:bg-[hsl(var(--primary)/0.94)]",
        destructive:
          "border-[color:var(--destructive-border)] bg-destructive text-destructive-foreground shadow-xs hover:bg-[hsl(var(--destructive)/0.94)]",
        outline:
          "border-[color:var(--button-outline)] bg-card/88 text-foreground shadow-xs backdrop-blur-sm hover:border-primary/25 hover:bg-accent/70",
        secondary:
          "border-[color:var(--secondary-border)] bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/85",
        ghost: "border-transparent bg-transparent text-foreground shadow-none hover:bg-accent/80 hover:text-accent-foreground",
        link: "border-transparent bg-transparent px-0 text-primary shadow-none hover:translate-y-0 hover:shadow-none hover:text-primary/85 hover:underline",
      },
      size: {
        default: "min-h-10 px-4 py-2.5",
        sm: "min-h-9 rounded-lg px-3.5 text-xs",
        lg: "min-h-11 rounded-xl px-6 text-sm",
        icon: "h-10 w-10",
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
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
