import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const NotFoundPage = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-4 text-center">
    <p className="font-display text-6xl font-semibold text-primary">404</p>
    <h1 className="font-display text-2xl font-semibold">This page doesn't exist</h1>
    <p className="max-w-sm text-muted">
      The address may be mistyped, or the page may have moved.
    </p>
    <Link to="/">
      <Button variant="outline">Go to your dashboard</Button>
    </Link>
  </div>
);
