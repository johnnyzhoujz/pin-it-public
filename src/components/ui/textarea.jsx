import { forwardRef } from "react";
import { cn } from "../../lib/utils.js";

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("ui-textarea", className)} {...props} />;
});
