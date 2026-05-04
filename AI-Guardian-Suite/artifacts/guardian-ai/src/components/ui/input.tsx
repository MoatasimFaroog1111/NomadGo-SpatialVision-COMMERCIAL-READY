import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1",
          "text-sm text-white/90 placeholder:text-white/25",
          "transition-all duration-200",
          "focus-visible:outline-none focus-visible:border-cyan-500/40 focus-visible:bg-white/[0.06]",
          "focus-visible:shadow-[0_0_0_3px_rgba(0,225,255,0.08)]",
          "disabled:cursor-not-allowed disabled:opacity-40",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
