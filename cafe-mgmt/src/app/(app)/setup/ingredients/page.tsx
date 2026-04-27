import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { IngredientReview } from "@/components/setup/ingredient-review";

export default async function IngredientsReviewPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const ingredients = await prisma.ingredient.findMany({
    where: { cafeId: session.user.cafeId },
    select: { id: true, name: true, unit: true, displayOrder: true },
    orderBy: { displayOrder: "asc" },
  });

  return (
    <div className="p-[var(--space-4)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-2)]">
        Review your ingredients
      </h1>
      <p className="text-body text-[var(--text-secondary)] mb-[var(--space-6)]">
        We&apos;ve added ingredients based on your template. Edit, remove, or add
        new ones to match your cafe.
      </p>
      <IngredientReview initialIngredients={ingredients} />
    </div>
  );
}
