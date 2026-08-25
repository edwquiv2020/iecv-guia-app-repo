import { useId, type ReactNode } from "react";

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  /** Recibe el id ya generado para conectar label ↔ control (htmlFor/id). */
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, required, className = "", children }: FieldProps) {
  const id = useId();
  return (
    <div className={`block ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {hint && <span className="ml-1.5 text-xs text-muted-foreground">{hint}</span>}
      <div className="mt-1">{children(id)}</div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
