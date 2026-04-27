import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center p-[var(--space-4)]">
      <p className="text-body text-[var(--text-primary)] mb-[var(--space-4)]">
        Page not found.
      </p>
      <Link href="/" className={buttonVariants({ className: "touch-target" })}>
        Go to Action Feed
      </Link>
    </div>
  );
}
