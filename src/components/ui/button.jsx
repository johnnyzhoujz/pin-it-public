import { cn } from "../../lib/utils.js";

const variantClass = {
  primary: "ui-button ui-button-primary",
  secondary: "ui-button ui-button-secondary",
  ghost: "ui-button ui-button-ghost",
  danger: "ui-button ui-button-danger",
  dangerGhost: "ui-button ui-button-danger-ghost",
  tertiary: "ui-button ui-button-tertiary"
};

const sizeClass = {
  default: "ui-button-md",
  sm: "ui-button-sm",
  lg: "ui-button-lg",
  icon: "ui-button-icon",
  "icon-sm": "ui-button-icon-sm"
};

export function Button({
  className,
  variant = "primary",
  size = "default",
  title,
  type = "button",
  ...props
}) {
  const isIconButton = size === "icon" || size === "icon-sm";
  const resolvedTitle = title ?? (isIconButton ? props["aria-label"] : undefined);

  return (
    <button
      className={cn(variantClass[variant], sizeClass[size], className)}
      title={resolvedTitle}
      type={type}
      {...props}
    />
  );
}
