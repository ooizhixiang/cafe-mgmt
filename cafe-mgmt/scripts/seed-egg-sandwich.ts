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

  const eggs = await g("Eggs", "pcs", 0);
  const mustard = await g("Mustard", "gm", 0);
  const kewpieMayo = await g("Kewpie Mayonnaise", "gm", 0);
  const pinkSalt = await g("Pink Salt", "gm", 0);
  const truffleFlavour = await g("Truffle Flavoured (Shake Shake)", "gm", 0);
  const blackPepper = await g("Black Pepper", "gm", 0);
  const bread = await g("Bread", "pcs", 0);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Egg Sandwich" } });
  if (r) { console.log("Already exists"); return; }

  // RM 1.91 per portion, 10 portions per batch, 15 eggs per batch
  r = await prisma.recipe.create({
    data: {
      name: "Egg Sandwich",
      description: "Egg mayo sandwich with truffle flavour",
      notes: "Batch makes 10 portions (15 eggs per batch)\nTotal cost per portion: RM 1.91",
      cafeId,
    }
  });
  console.log("+ Recipe: Egg Sandwich");

  await prisma.recipeIngredient.createMany({ data: [
    { recipeId: r.id, ingredientId: eggs.id, quantityPerServing: 2, subtotalOverrideInCents: 0 },
    { recipeId: r.id, ingredientId: mustard.id, quantityPerServing: 1, subtotalOverrideInCents: 0 },
    { recipeId: r.id, ingredientId: kewpieMayo.id, quantityPerServing: 1, subtotalOverrideInCents: 0 },
    { recipeId: r.id, ingredientId: pinkSalt.id, quantityPerServing: 1, subtotalOverrideInCents: 0 },
    { recipeId: r.id, ingredientId: truffleFlavour.id, quantityPerServing: 1, subtotalOverrideInCents: 0 },
    { recipeId: r.id, ingredientId: blackPepper.id, quantityPerServing: 1, subtotalOverrideInCents: 0 },
    { recipeId: r.id, ingredientId: bread.id, quantityPerServing: 2, subtotalOverrideInCents: 0 },
  ]});

  await prisma.recipeStep.createMany({ data: [
    { recipeId: r.id, stepNumber: 1, instruction: "Boil the 15pcs egg for 10 minutes" },
    { recipeId: r.id, stepNumber: 2, instruction: "Soak the boiled eggs into the water" },
    { recipeId: r.id, stepNumber: 3, instruction: "Peel the egg shells" },
    { recipeId: r.id, stepNumber: 4, instruction: "Smash the eggs" },
    { recipeId: r.id, stepNumber: 5, instruction: "Put the mustard, kewpie mayonnaise, pink salt, truffle flavoured (shake shake), black pepper together" },
    { recipeId: r.id, stepNumber: 6, instruction: "Put 2 scoops on the bread and serve" },
  ]});

  console.log("Total cost: RM 1.91");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
