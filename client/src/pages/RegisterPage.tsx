import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FormField } from "@/components/FormField";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { ApiRequestError } from "@/services/api";
import { dashboardPathFor } from "@/utils/roleRoutes";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "@/utils/validation";

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!firstName.trim()) {
      errors.firstName = "Enter your first name.";
    }
    if (!lastName.trim()) {
      errors.lastName = "Enter your last name.";
    }
    if (!email.trim()) {
      errors.email = "Enter your email address.";
    } else if (!isValidEmail(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (!password) {
      errors.password = "Choose a password.";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (!confirmPassword) {
      errors.confirmPassword = "Repeat your password.";
    } else if (confirmPassword !== password) {
      errors.confirmPassword = "Passwords don't match.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });
      navigate(dashboardPathFor(user.role), { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError && error.fieldErrors?.length) {
        const serverErrors: FieldErrors = {};
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field in serverErrors === false) {
            serverErrors[fieldError.field as keyof FieldErrors] = fieldError.message;
          }
        }
        setFieldErrors(serverErrors);
      }
      setFormError(
        error instanceof Error ? error.message : "Registration failed. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Join as a student — it takes less than a minute.</CardDescription>
      </CardHeader>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <CardContent className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="First name"
              name="firstName"
              autoComplete="given-name"
              placeholder="Ada"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              error={fieldErrors.firstName}
            />
            <FormField
              label="Last name"
              name="lastName"
              autoComplete="family-name"
              placeholder="Lovelace"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              error={fieldErrors.lastName}
            />
          </div>

          <FormField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
          />

          <FormField
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
          />

          <FormField
            label="Confirm password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={fieldErrors.confirmPassword}
          />
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" isLoading={isSubmitting} className="w-full">
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-center text-sm text-muted">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-primary hover:text-primary-strong"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
};
