import { TemplateSelector } from "@/components/setup/template-selector";

export default function SetupPage() {
  return (
    <div className="p-[var(--space-4)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-2)]">Set up your cafe</h1>
      <p className="text-body text-[var(--text-secondary)] mb-[var(--space-6)]">
        Choose a template to get started with pre-populated ingredients,
        checklists, and suppliers. You can customize everything later.
      </p>
      <TemplateSelector />
    </div>
  );
}
