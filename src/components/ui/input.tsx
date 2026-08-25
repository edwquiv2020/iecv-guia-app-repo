import { forwardRef, type InputHTMLAttributes } from "react";

export type FieldSize = "md" | "sm";

// Sin padding/tamaño de texto: eso lo pone FIELD_SIZE_CLASSES. Tailwind no
// garantiza que una utility "px-2" al final de className le gane a un
// "px-3" que ya viene en la base — dos utilities de la misma propiedad
// compiten por orden de generación en el CSS, no por orden en el string.
export const FIELD_CLASSES =
  "w-full rounded-lg border bg-surface text-foreground placeholder:text-muted-foreground " +
  "disabled:bg-surface-muted disabled:text-muted-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

export const FIELD_SIZE_CLASSES: Record<FieldSize, string> = {
  md: "px-3 py-2 text-sm",
  sm: "px-2.5 py-1.5 text-xs",
};

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  invalid?: boolean;
  size?: FieldSize;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, size = "md", className = "", ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`${FIELD_CLASSES} ${FIELD_SIZE_CLASSES[size]} ${invalid ? "border-danger" : "border-border"} ${className}`}
      {...props}
    />
  );
});
