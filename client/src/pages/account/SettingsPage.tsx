import { KeyRound, LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FormField } from "@/components/FormField";
import { Alert } from "@/components/ui/alert";
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
import { authService } from "@/services/auth.service";
import { MIN_PASSWORD_LENGTH } from "@/utils/validation";

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

/** Account settings. Currently one thing that matters: the password. */
export const SettingsPage = () => {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!currentPassword) {
      next.currentPassword = "Enter your current password";
    }
    if (!newPassword) {
      next.newPassword = "Enter a new password";
    } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
      next.newPassword = `Must be at least ${MIN_PASSWORD_LENGTH} characters`;
    } else if (newPassword.length > 128) {
      next.newPassword = "Cannot exceed 128 characters";
    } else if (newPassword === currentPassword) {
      next.newPassword = "Must be different from your current password";
    }
    if (confirmPassword !== newPassword) {
      next.confirmPassword = "Passwords do not match";
    }
    return next;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSaving(true);
    try {
      await authService.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password changed", "success");
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : "Could not change your password. Please try again.";
      // A rejected current password belongs on that field, not at the top.
      if (error instanceof ApiRequestError && error.status === 401) {
        setErrors({ currentPassword: message });
      } else {
        setFormError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await logout();
    void navigate("/login", { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-muted">Manage how you sign in to EduNexa.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Change password</CardTitle>
          <CardDescription>
            Your current password is required, so a forgotten session on another
            device cannot change it.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="max-w-md space-y-4">
            {formError && <Alert variant="error">{formError}</Alert>}

            <FormField
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              error={errors.currentPassword}
              autoComplete="current-password"
              disabled={isSaving}
            />
            <FormField
              label="New password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              error={errors.newPassword}
              autoComplete="new-password"
              disabled={isSaving}
            />
            <FormField
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              error={errors.confirmPassword}
              autoComplete="new-password"
              disabled={isSaving}
            />
            <p className="text-sm text-muted">
              At least {MIN_PASSWORD_LENGTH} characters. You will stay signed in on this
              device.
            </p>
          </CardContent>

          <div className="px-6 pt-2 pb-6">
            <Button type="submit" isLoading={isSaving}>
              <KeyRound className="size-4" aria-hidden="true" />
              Change password
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account</CardTitle>
          <CardDescription>
            Signed in as {user?.email ?? "—"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pb-6">
          <Link to="/profile">
            <Button variant="outline">
              <UserRound className="size-4" aria-hidden="true" />
              Edit my profile
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => void handleSignOut()}
            isLoading={isSigningOut}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Forgotten your password?</CardTitle>
        </CardHeader>
        <CardContent className="pb-6 text-sm text-muted">
          Self-service password reset by email is not available yet. If you are locked
          out, an administrator can set a new password for you from the Users screen.
        </CardContent>
      </Card>
    </div>
  );
};
