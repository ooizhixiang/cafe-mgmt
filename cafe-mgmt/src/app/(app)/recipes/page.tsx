import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RecipeEditor } from "@/components/operations/recipe-editor";

export default async function RecipesPage() {
  const session = await requireAuth();
  const cafeId = session.user.cafeId;
  const isManager = session.user.role === "MANAGER";

  const ingredients = await prisma.ingredient.findMany({
    where: { cafeId },
    select: { id: true, name: true, unit: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Recipes</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">View and manage recipes</p>
      <RecipeEditor isManager={isManager} ingredients={ingredients} />
    </div>
  );
}
