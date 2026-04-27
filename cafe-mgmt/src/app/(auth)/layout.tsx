export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-page)] px-[var(--space-4)]">
      <div className="w-full max-w-[400px]">{children}</div>
    </div>
  );
}
