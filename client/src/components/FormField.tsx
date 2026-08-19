import { useId } from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormFieldProps extends Omit<InputProps, "id" | "aria-invalid" | "aria-describedby"> {
  label: string;
  error?: string;
}

/** Labelled input with an accessible, screen-reader-linked error message. */
export const FormField = ({ label, error, ...inputProps }: FormFieldProps) => {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
};
