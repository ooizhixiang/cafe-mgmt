import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const cafe = await prisma.cafe.findFirst();
  if (!cafe) { console.log("No cafe"); return; }
  const cafeId = cafe.id;
  console.log("Cafe:", cafe.name);

  async function g(name: string, unit: string, costCents: number) {
    let i = await prisma.ingredient.findFirst({ where: { cafeId, name } });
    if (!i) {
      const mx = await prisma.ingredient.findFirst({ where: { cafeId }, orderBy: { displayOrder: "desc" }, select: { displayOrder: true } });
      i = await prisma.ingredient.create({ data: { name, unit, cafeId, displayOrder: (mx?.displayOrder ?? 0) + 1, costPerUnitInCents: costCents } });
      console.log("+ " + name);
    }
    return i;
  }

  const espresso = await g("Espresso Blend", "gm", 8);
  const coconutMilk = await g("Coconut Milk", "ml", 0);
  const cup = await g("Paper Cup 8oz", "pcs", 50);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Hot Coconut Latte" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({ data: { name: "Hot Coconut Latte", description: "Steamed coconut milk with double shot espresso", cafeId } });
  console.log("+ Recipe: Hot Coconut Latte");

  await prisma.recipeIngredient.createMany({ data: [
    { recipeId: r.id, ingredientId: espresso.id, quantityPerServing: 18, subtotalOverrideInCents: 150 },
    { recipeId: r.id, ingredientId: coconutMilk.id, quantityPerServing: 200, subtotalOverrideInCents: 50 },
    { recipeId: r.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});

  await prisma.recipeStep.createMany({ data: [
    { recipeId: r.id, stepNumber: 1, instruction: "Add 200ml steamed coconut milk into the cup" },
    { recipeId: r.id, stepNumber: 2, instruction: "Add the 2 shot espresso into the cup" },
    { recipeId: r.id, stepNumber: 3, instruction: "Stir completely" },
  ]});

  console.log("Total cost: RM 2.50");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
