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
  const coconut = await g("Fresh Coconut Water", "ml", 1); // 2.00/200ml = 1 cent/ml
  const ice = await g("Ice", "cup", 20);
  const plasticCup = await g("Plastic Cup 12oz", "pcs", 50);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Fresh Coconut Latte (Ice)" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({ data: { name: "Fresh Coconut Latte (Ice)", description: "Iced espresso with fresh coconut water", cafeId } });
  console.log("+ Recipe: Fresh Coconut Latte (Ice)");

  // Single variation — no milk choice, just one version
  await prisma.recipeIngredient.createMany({ data: [
    { recipeId: r.id, ingredientId: espresso.id, quantityPerServing: 18, subtotalOverrideInCents: 150 },
    { recipeId: r.id, ingredientId: coconut.id, quantityPerServing: 200, subtotalOverrideInCents: 200 },
    { recipeId: r.id, ingredientId: ice.id, quantityPerServing: 1, subtotalOverrideInCents: 20 },
    { recipeId: r.id, ingredientId: plasticCup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});

  await prisma.recipeStep.createMany({ data: [
    { recipeId: r.id, stepNumber: 1, instruction: "Add 2 shot espresso in a plastic cup" },
    { recipeId: r.id, stepNumber: 2, instruction: "Add 200ml fresh coconut water into the cup" },
    { recipeId: r.id, stepNumber: 3, instruction: "Add ice until the cup is filled" },
  ]});

  console.log("Total cost: RM 4.20");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
