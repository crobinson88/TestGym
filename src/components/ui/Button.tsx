import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center rounded-xl font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-bg hover:bg-accent/90",
        secondary: "bg-surface2 text-text hover:bg-surface2/80 border border-line",
        ghost: "bg-transparent text-text hover:bg-surface2",
        danger: "bg-danger text-bg hover:bg-danger/90",
      },
      size: {
        sm: "h-10 px-3 text-sm min-w-tap",
        md: "h-12 px-4 text-base min-w-tap",
        lg: "h-14 px-5 text-lg min-w-tap",
        icon: "h-12 w-12 min-w-tap",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
