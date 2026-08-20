import { Check, Copy, KeyRound, Wand2 } from "lucide-react";
import { useState } from "react";
import { FormField } from "@/components/FormField";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ApiRequestError } from "@/services/api";
import { usersService } from "@/services/users.service";
import type { User } from "@/types";
import { MIN_PASSWORD_LENGTH } from "@/utils/validation";

// Ambiguous characters are left out so a password can be read aloud or copied
// from a chat message without O/0 and l/1 confusion.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const generatePassword = (length = 16): string => {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
};

interface Props {
  user: User;
  onClose: () => void;
  onReset: () => void;
}

/**
 * Admin-issued password reset.
 *
 * There is no password-reset email yet, so the admin has to hand the new
 * password to the person themselves — which is why this shows the value in
 * plain text and offers a copy button instead of hiding it.
 */
export const ResetPasswordModal = ({ user, onClose, onReset }: Props) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    setPassword(generatePassword());
    setError(undefined);
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; the value is on screen either way.
      setFormError("Could not copy automatically — select the password and copy it.");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!password) {
      setError("Enter or generate a password");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    setError(undefined);

    setIsSaving(true);
    try {
      await usersService.resetPassword(user.id, password);
      onReset();
    } catch (caught) {
      setFormError(
        caught instanceof ApiRequestError
          ? caught.message
          : "Could not reset the password. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Reset password"
      description={`Set a new password for ${user.firstName} ${user.lastName}.`}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        <FormField
          label="New password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setCopied(false);
          }}
          error={error}
          autoComplete="new-password"
          disabled={isSaving}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleGenerate}>
            <Wand2 className="size-4" aria-hidden="true" />
            Generate
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleCopy()}
            disabled={!password}
          >
            {copied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <Alert variant="warning">
          Share this password with {user.firstName} directly — it is shown once and
          cannot be retrieved afterwards. Ask them to change it after signing in.
        </Alert>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>
            <KeyRound className="size-4" aria-hidden="true" />
            Reset password
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
