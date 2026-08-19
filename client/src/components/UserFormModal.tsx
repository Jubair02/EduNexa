import { useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ApiRequestError } from "@/services/api";
import { usersService } from "@/services/users.service";
import type { User, UserRole } from "@/types";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "@/utils/validation";

interface UserFormModalProps {
  open: boolean;
  /** When set, the form edits this user; otherwise it creates a new one. */
  user?: User | null;
  onClose: () => void;
  onSaved: (user: User, mode: "created" | "updated") => void;
}

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: string;
}

/**
 * Reusable create/edit user form. Editing never shows a password field, so a
 * user's password can never be overwritten from here.
 */
export const UserFormModal = ({ open, user, onClose, onSaved }: UserFormModalProps) => {
  const isEdit = Boolean(user);

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(user?.role ?? "student");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!firstName.trim()) errors.firstName = "Enter a first name.";
    if (!lastName.trim()) errors.lastName = "Enter a last name.";
    if (!email.trim()) {
      errors.email = "Enter an email address.";
    } else if (!isValidEmail(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (!isEdit) {
      if (!password) {
        errors.password = "Choose a password.";
      } else if (password.length < MIN_PASSWORD_LENGTH) {
        errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      if (isEdit && user) {
        const updated = await usersService.update(user.id, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          role,
          isActive,
        });
        onSaved(updated, "updated");
      } else {
        const created = await usersService.create({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
          role,
        });
        onSaved(created, "created");
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.fieldErrors?.length) {
        const serverErrors: FieldErrors = {};
        for (const fieldError of error.fieldErrors) {
          serverErrors[fieldError.field as keyof FieldErrors] = fieldError.message;
        }
        setFieldErrors(serverErrors);
      }
      setFormError(
        error instanceof Error ? error.message : "Saving failed. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit user" : "Create user"}
      description={
        isEdit
          ? "Update this user's profile, role, or status."
          : "The new user can sign in with the email and password you set here."
      }
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="First name"
            name="firstName"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            error={fieldErrors.firstName}
          />
          <FormField
            label="Last name"
            name="lastName"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            error={fieldErrors.lastName}
          />
        </div>

        <FormField
          label="Email"
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
        />

        {!isEdit && (
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
        )}

        <div className={isEdit ? "grid gap-4 sm:grid-cols-2" : undefined}>
          <div>
            <Label htmlFor="user-form-role">Role</Label>
            <Select
              id="user-form-role"
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
            >
              <option value="student">Student</option>
              <option value="instructor">Instructor</option>
              <option value="admin">Administrator</option>
            </Select>
            {fieldErrors.role && (
              <p className="mt-1.5 text-sm text-danger">{fieldErrors.role}</p>
            )}
          </div>

          {isEdit && (
            <div>
              <Label htmlFor="user-form-status">Status</Label>
              <Select
                id="user-form-status"
                name="status"
                value={isActive ? "active" : "inactive"}
                onChange={(event) => setIsActive(event.target.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? "Save changes" : "Create user"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
