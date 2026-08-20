import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Reusable confirmation for destructive actions. */
export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => (
  <Dialog open={open} onClose={onCancel} title={title} className="max-w-md">
    <p className="text-sm whitespace-pre-line text-muted">{message}</p>
    <div className="mt-6 flex justify-end gap-3">
      <Button variant="outline" onClick={onCancel} disabled={isLoading}>
        Cancel
      </Button>
      <Button
        onClick={onConfirm}
        isLoading={isLoading}
        className="bg-danger hover:bg-danger-strong"
      >
        {confirmLabel}
      </Button>
    </div>
  </Dialog>
);
