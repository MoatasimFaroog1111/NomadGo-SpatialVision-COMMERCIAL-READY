import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_rgba(0,225,255,0.1)]",
        secondary: "border-violet-500/30 bg-violet-500/10 text-violet-300",
        destructive: "border-red-500/30 bg-red-500/10 text-red-400",
        outline: "border-white/15 text-white/60 bg-white/[0.03]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
