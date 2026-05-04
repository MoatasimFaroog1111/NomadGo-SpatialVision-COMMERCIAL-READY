import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold",
    "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-gradient-to-r from-cyan-500 to-cyan-600 text-black",
          "border border-cyan-400/20",
          "shadow-[0_0_20px_rgba(0,225,255,0.2)]",
          "hover:shadow-[0_0_28px_rgba(0,225,255,0.35)] hover:from-cyan-400 hover:to-cyan-500",
          "hover:-translate-y-px",
          "active:translate-y-0 active:shadow-none",
        ].join(" "),
        destructive: [
          "bg-red-500/90 text-white border border-red-500/30",
          "hover:bg-red-400 hover:-translate-y-px",
        ].join(" "),
        outline: [
          "border border-white/10 bg-white/[0.03] text-white/80",
          "hover:border-cyan-500/30 hover:bg-white/[0.06] hover:text-white",
          "hover:-translate-y-px",
        ].join(" "),
        secondary: [
          "bg-white/[0.06] text-white/80 border border-white/10",
          "hover:bg-white/[0.09] hover:text-white hover:-translate-y-px",
        ].join(" "),
        ghost: [
          "text-white/60 border border-transparent",
          "hover:bg-white/[0.05] hover:text-white/90",
        ].join(" "),
        link: "text-cyan-400 underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-lg px-3 text-xs",
        lg: "min-h-10 rounded-xl px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
