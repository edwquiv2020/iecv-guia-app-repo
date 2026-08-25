import { forwardRef, type TextareaHTMLAttributes } from "react";
import { FIELD_CLASSES, FIELD_SIZE_CLASSES, type FieldSize } from "./Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  size?: FieldSize;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, size = "md", className = "", ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={`${FIELD_CLASSES} ${FIELD_SIZE_CLASSES[size]} ${invalid ? "border-danger" : "border-border"} ${className}`}
      {...props}
    />
  );
});
