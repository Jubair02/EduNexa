import { Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FormField } from "@/components/FormField";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { ApiRequestError } from "@/services/api";
import { isValidEmail } from "@/utils/validation";

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  instructor: "Instructor",
  student: "Student",
};

/** The signed-in user's own details. Available to every role. */
export const ProfilePage = () => {
  const { user, updateProfile } = useAuth();
  const { showToast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Seed the form from the session, and re-seed if the user changes underneath
  // us (a save elsewhere, or a session restore completing).
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setEmail(user.email);
  }, [user]);

  if (!user) return null;

  const isDirty =
    firstName.trim() !== user.firstName ||
    lastName.trim() !== user.lastName ||
    email.trim().toLowerCase() !== user.email.toLowerCase();

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!firstName.trim()) next.firstName = "First name is required";
    else if (firstName.trim().length > 50) next.firstName = "Cannot exceed 50 characters";
    if (!lastName.trim()) next.lastName = "Last name is required";
    else if (lastName.trim().length > 50) next.lastName = "Cannot exceed 50 characters";
    if (!email.trim()) next.email = "Email is required";
    else if (!isValidEmail(email)) next.email = "Enter a valid email address";
    return next;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (!isDirty) return;

    setIsSaving(true);
    try {
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      });
      showToast("Profile updated", "success");
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : "Could not save your profile. Please try again.";
      // A taken email is a field problem, not a page-level one.
      if (error instanceof ApiRequestError && error.status === 409) {
        setErrors({ email: message });
      } else {
        setFormError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setEmail(user.email);
    setErrors({});
    setFormError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">My profile</h1>
        <p className="mt-1 text-muted">Your name and sign-in email.</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-6">
          <Avatar firstName={user.firstName} lastName={user.lastName} className="size-14" />
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-sm text-muted">{user.email}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="primary">{ROLE_LABEL[user.role] ?? user.role}</Badge>
            {user.isActive ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="muted">Inactive</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Personal details</CardTitle>
          <CardDescription>
            Your email is also your sign-in address — changing it changes how you log in.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-4">
            {formError && <Alert variant="error">{formError}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="First name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                error={errors.firstName}
                autoComplete="given-name"
                maxLength={50}
                disabled={isSaving}
              />
              <FormField
                label="Last name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                error={errors.lastName}
                autoComplete="family-name"
                maxLength={50}
                disabled={isSaving}
              />
            </div>

            <FormField
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={errors.email}
              autoComplete="email"
              disabled={isSaving}
            />

            <div className="rounded-xl border border-soft bg-paper p-4">
              <p className="text-sm font-medium">Role and account status</p>
              <p className="mt-1 text-sm text-muted">
                Only an administrator can change these. Ask one if something looks wrong.
              </p>
            </div>
          </CardContent>

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-2 pb-6">
            <Link to="/settings" className="text-sm font-medium text-primary hover:underline">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4" aria-hidden="true" />
                Change your password
              </span>
            </Link>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={isSaving || !isDirty}
              >
                Discard changes
              </Button>
              <Button type="submit" isLoading={isSaving} disabled={!isDirty}>
                <Save className="size-4" aria-hidden="true" />
                Save changes
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
};
