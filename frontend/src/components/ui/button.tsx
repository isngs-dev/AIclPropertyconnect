"use client";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[.98] whitespace-nowrap",
  {
    variants: {
      variant: {
        // Orange is reserved for primary call-to-action. Dark text keeps contrast >= 5:1 on #EC4899.
        cta: "bg-pink text-[#080A24] hover:bg-pink-light shadow-[0_6px_20px_-8px_rgba(236,72,153,.8)]",
        primary: "bg-navy text-white hover:bg-navy-deep dark:hover:bg-[#1b8cc2]",
        outline: "border border-line bg-card text-fg hover:bg-soft",
        ghost: "text-fg hover:bg-soft",
        success: "bg-green text-[#04130d] hover:bg-green-light",
        danger: "bg-[#B91C1C] text-white hover:bg-[#991B1B]",
      },
      size: { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp: any = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...props}>
        {asChild ? children : (
          <>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
