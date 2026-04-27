export default function Loading() {
  return (
    <div className="p-[var(--space-4)] space-y-[var(--space-4)]">
      <div className="h-8 w-48 animate-pulse rounded bg-[var(--bg-secondary)]" />
      <div className="space-y-[var(--space-3)]">
        <div className="h-24 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
        <div className="h-24 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
        <div className="h-24 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
      </div>
    </div>
  );
}
