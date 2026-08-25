import { forwardRef, type SelectHTMLAttributes } from "react";
import { FIELD_CLASSES, FIELD_SIZE_CLASSES, type FieldSize } from "./Input";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  invalid?: boolean;
  size?: FieldSize;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, size = "md", className = "", children, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={`${FIELD_CLASSES} ${FIELD_SIZE_CLASSES[size]} ${invalid ? "border-danger" : "border-border"} ${className}`}
      {...props}
    >
      {children}
    </select>
  );
});
