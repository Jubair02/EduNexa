import { Outlet } from "react-router-dom";

/**
 * Split-screen auth shell: brand panel on the left (hidden on small screens),
 * form area on the right.
 */
export const AuthLayout = () => (
  <div className="flex min-h-screen">
    <aside className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-aubergine p-10 text-white lg:flex">
      {/* Petal motif — the one decorative flourish on the page */}
      <div
        aria-hidden="true"
        className="absolute -right-24 -bottom-24 size-96 rounded-[50%_50%_50%_0] bg-primary/25"
      />
      <div
        aria-hidden="true"
        className="absolute -right-10 -bottom-40 size-72 rotate-12 rounded-[50%_50%_50%_0] bg-amber/15"
      />

      <div>
        <p className="font-display text-2xl font-semibold tracking-tight">
          Edu<span className="text-amber">Nexa</span>
        </p>
      </div>

      <div className="relative max-w-md">
        <h1 className="font-display text-4xl leading-tight font-semibold">
          Teaching grows things.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-white/70">
          One place for your courses, your classes, and your progress — for
          administrators, instructors, and students alike.
        </p>
      </div>

      <p className="relative text-sm text-white/50">
        EduNexa — the learning platform by Tulip Tech
      </p>
    </aside>

    <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-md">
        <p className="mb-8 text-center font-display text-2xl font-semibold tracking-tight lg:hidden">
          Edu<span className="text-primary">Nexa</span>
        </p>
        <Outlet />
      </div>
    </main>
  </div>
);
