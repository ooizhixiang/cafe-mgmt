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
  const hw = await g("Hot Water", "ml", 0);
  const cup = await g("Paper Cup 8oz", "pcs", 50);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Americano (Hot)" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({ data: { name: "Americano (Hot)", description: "Double shot espresso with hot water", cafeId } });
  console.log("+ Recipe: Americano (Hot)");

  await prisma.recipeIngredient.createMany({ data: [
    { recipeId: r.id, ingredientId: espresso.id, quantityPerServing: 18, subtotalOverrideInCents: 150 },
    { recipeId: r.id, ingredientId: hw.id, quantityPerServing: 175 },
    { recipeId: r.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});

  await prisma.recipeStep.createMany({ data: [
    { recipeId: r.id, stepNumber: 1, instruction: "2 shots of espresso is poured into a paper cup" },
    { recipeId: r.id, stepNumber: 2, instruction: "Pour the hot water 175ml (at 100°C) into the cup" },
  ]});

  console.log("Total cost: RM 2.00");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
