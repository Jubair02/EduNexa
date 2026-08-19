import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

interface DashboardPlaceholderProps {
  welcome: string;
  roleLabel: string;
}

/** Phase 1 placeholder dashboard — replaced with real content in later phases. */
export const DashboardPlaceholder = ({ welcome, roleLabel }: DashboardPlaceholderProps) => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">{welcome}</h1>
        <p className="mt-1 text-muted">Role: {roleLabel}</p>
      </div>

      {user && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-lg">Your account</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Name</dt>
                <dd className="font-medium">
                  {user.firstName} {user.lastName}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Email</dt>
                <dd className="font-medium">{user.email}</dd>
              </div>
              <div>
                <dt className="text-muted">Role</dt>
                <dd className="font-medium capitalize">{user.role}</dd>
              </div>
              <div>
                <dt className="text-muted">Member since</dt>
                <dd className="font-medium">
                  {new Date(user.createdAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted">
        Courses and classes arrive in the next phase of EduNexa.
      </p>
    </div>
  );
};
