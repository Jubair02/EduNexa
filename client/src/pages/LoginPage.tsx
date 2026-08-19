import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import { dashboardPathFor } from "@/utils/roleRoutes";
import { isValidEmail } from "@/utils/validation";

interface FieldErrors {
  email?: string;
  password?: string;
}

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!email.trim()) {
      errors.email = "Enter your email address.";
    } else if (!isValidEmail(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (!password) {
      errors.password = "Enter your password.";
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
      const user = await login({ email: email.trim(), password });
      const from = (location.state as { from?: { pathname?: string } } | null)?.from
        ?.pathname;
      navigate(from ?? dashboardPathFor(user.role), { replace: true });
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Sign-in failed. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Pick up where you left off.</CardDescription>
      </CardHeader>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <CardContent className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}

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
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
          />
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" isLoading={isSubmitting} className="w-full">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted">
            New to EduNexa?{" "}
            <Link
              to="/register"
              className="font-medium text-primary hover:text-primary-strong"
            >
              Create an account
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
};
