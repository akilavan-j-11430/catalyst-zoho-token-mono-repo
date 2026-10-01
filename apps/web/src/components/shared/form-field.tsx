import type { UseFormRegisterReturn } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface FormFieldProps {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  error?: string;
  /** The result of react-hook-form's `register`, spread onto the input. */
  field: UseFormRegisterReturn;
}

export function FormField({
  id,
  label,
  type,
  placeholder,
  error,
  field,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  return (
    <Field data-invalid={error !== undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : undefined}
        {...field}
      />
      {error !== undefined && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
}
