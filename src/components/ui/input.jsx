import { forwardRef } from "react";
import { cn } from "../../lib/utils.js";

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("ui-input", className)} {...props} />;
});
