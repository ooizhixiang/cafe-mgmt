import type { Period } from "@/generated/prisma/enums";

export interface TemplateIngredient {
  name: string;
  unit: string;
}

export interface TemplateChecklistItem {
  text: string;
}

export interface TemplateChecklist {
  name: string;
  period: Period;
  items: TemplateChecklistItem[];
}

export interface TemplateSupplier {
  name: string;
  notes: string;
}

export interface CafeTemplate {
  id: string;
  name: string;
  description: string;
  ingredients: TemplateIngredient[];
  checklists: TemplateChecklist[];
  suppliers: TemplateSupplier[];
}

export const TEMPLATES: CafeTemplate[] = [
  {
    id: "specialty-coffee",
    name: "Specialty Coffee",
    description:
      "For third-wave coffee shops focused on quality espresso, pour-overs, and specialty drinks.",
    ingredients: [
      { name: "Espresso Beans", unit: "kg" },
      { name: "Filter Beans", unit: "kg" },
      { name: "Decaf Beans", unit: "kg" },
      { name: "Whole Milk", unit: "L" },
      { name: "Oat Milk", unit: "L" },
      { name: "Almond Milk", unit: "L" },
      { name: "Soy Milk", unit: "L" },
      { name: "Heavy Cream", unit: "L" },
      { name: "Vanilla Syrup", unit: "bottle" },
      { name: "Caramel Syrup", unit: "bottle" },
      { name: "Hazelnut Syrup", unit: "bottle" },
      { name: "Chocolate Sauce", unit: "bottle" },
      { name: "Matcha Powder", unit: "bag" },
      { name: "Chai Concentrate", unit: "L" },
      { name: "Cup Lids (hot)", unit: "sleeve" },
      { name: "Cup Lids (cold)", unit: "sleeve" },
      { name: "Cups (12oz)", unit: "sleeve" },
      { name: "Cups (16oz)", unit: "sleeve" },
    ],
    checklists: [
      {
        name: "Opening Checklist",
        period: "OPENING",
        items: [
          { text: "Turn on espresso machine and grinder" },
          { text: "Purge group heads and steam wand" },
          { text: "Dial in espresso (target 18g in / 36g out / 28s)" },
          { text: "Check milk fridge stock levels" },
          { text: "Fill syrup pumps and sauces" },
          { text: "Brew batch filter coffee" },
          { text: "Set out pastry display" },
          { text: "Unlock front door and flip sign" },
        ],
      },
      {
        name: "Mid-Day Checklist",
        period: "MID_DAY",
        items: [
          { text: "Restock milk from walk-in" },
          { text: "Wipe down steam wand and drip tray" },
          { text: "Restock cups, lids, and sleeves" },
          { text: "Check pastry case — pull stale items" },
          { text: "Empty trash if over half full" },
          { text: "Wipe tables and seating area" },
        ],
      },
      {
        name: "Closing Checklist",
        period: "CLOSING",
        items: [
          { text: "Backflush espresso machine" },
          { text: "Clean grinder hopper and burrs" },
          { text: "Empty and clean drip trays" },
          { text: "Wash all pitchers and portafilters" },
          { text: "Wipe down counters and POS" },
          { text: "Mop floors" },
          { text: "Take out trash and recycling" },
          { text: "Lock doors and set alarm" },
        ],
      },
    ],
    suppliers: [
      { name: "Coffee Roaster", notes: "Weekly bean delivery" },
      { name: "Dairy Supplier", notes: "Milk and cream" },
      { name: "Supplies Vendor", notes: "Cups, lids, syrups" },
    ],
  },
  {
    id: "traditional-cafe",
    name: "Traditional Cafe",
    description:
      "For full-service cafes with a food menu, baked goods, and standard coffee drinks.",
    ingredients: [
      { name: "Coffee Beans (house blend)", unit: "kg" },
      { name: "Decaf Beans", unit: "kg" },
      { name: "Whole Milk", unit: "L" },
      { name: "Skim Milk", unit: "L" },
      { name: "Half & Half", unit: "L" },
      { name: "Butter", unit: "kg" },
      { name: "Eggs", unit: "dozen" },
      { name: "All-Purpose Flour", unit: "kg" },
      { name: "Sugar", unit: "kg" },
      { name: "Bread (sliced)", unit: "loaf" },
      { name: "Croissants", unit: "unit" },
      { name: "Muffins", unit: "unit" },
      { name: "Sandwich Wraps", unit: "pack" },
      { name: "Mixed Greens", unit: "bag" },
      { name: "Tomatoes", unit: "kg" },
      { name: "Cheese (sliced)", unit: "kg" },
      { name: "Turkey (deli)", unit: "kg" },
      { name: "Napkins", unit: "pack" },
    ],
    checklists: [
      {
        name: "Opening Checklist",
        period: "OPENING",
        items: [
          { text: "Turn on ovens and coffee machines" },
          { text: "Prep sandwich station" },
          { text: "Stock pastry display case" },
          { text: "Check fridge temperatures" },
          { text: "Brew first batch of coffee" },
          { text: "Set out menus and table numbers" },
          { text: "Unlock front door" },
        ],
      },
      {
        name: "Mid-Day Checklist",
        period: "MID_DAY",
        items: [
          { text: "Restock sandwich station supplies" },
          { text: "Rotate pastry display" },
          { text: "Wipe down all tables" },
          { text: "Restock condiment station" },
          { text: "Check coffee levels — brew if needed" },
          { text: "Empty dining area trash cans" },
        ],
      },
      {
        name: "Closing Checklist",
        period: "CLOSING",
        items: [
          { text: "Clean all food prep surfaces" },
          { text: "Wrap and store leftover food" },
          { text: "Clean coffee machines" },
          { text: "Wash and sanitize dishes" },
          { text: "Wipe down counters and tables" },
          { text: "Sweep and mop floors" },
          { text: "Take out trash and recycling" },
          { text: "Lock up and set alarm" },
        ],
      },
    ],
    suppliers: [
      { name: "Food Distributor", notes: "Weekly food delivery" },
      { name: "Bakery Supplier", notes: "Daily pastry delivery" },
      { name: "Coffee Supplier", notes: "Bi-weekly bean order" },
    ],
  },
  {
    id: "tea-light-bites",
    name: "Tea & Light Bites",
    description:
      "For tea houses and light-fare cafes specializing in teas, smoothies, and small plates.",
    ingredients: [
      { name: "Black Tea (loose)", unit: "kg" },
      { name: "Green Tea (loose)", unit: "kg" },
      { name: "Chamomile Tea", unit: "box" },
      { name: "Earl Grey Tea", unit: "box" },
      { name: "Peppermint Tea", unit: "box" },
      { name: "Matcha Powder", unit: "bag" },
      { name: "Honey", unit: "bottle" },
      { name: "Agave Syrup", unit: "bottle" },
      { name: "Lemon", unit: "unit" },
      { name: "Ginger (fresh)", unit: "kg" },
      { name: "Whole Milk", unit: "L" },
      { name: "Oat Milk", unit: "L" },
      { name: "Frozen Berries", unit: "bag" },
      { name: "Banana", unit: "unit" },
      { name: "Granola", unit: "bag" },
      { name: "Yogurt", unit: "L" },
      { name: "Scones", unit: "unit" },
      { name: "Tea Filters", unit: "box" },
    ],
    checklists: [
      {
        name: "Opening Checklist",
        period: "OPENING",
        items: [
          { text: "Heat water boilers to temperature" },
          { text: "Set up tea station with canisters" },
          { text: "Prep smoothie station (fruit, blender)" },
          { text: "Stock baked goods display" },
          { text: "Check honey, agave, and lemon stock" },
          { text: "Set tables and light candles" },
          { text: "Open doors and update hours sign" },
        ],
      },
      {
        name: "Mid-Day Checklist",
        period: "MID_DAY",
        items: [
          { text: "Refill tea canisters if low" },
          { text: "Restock smoothie fruits from freezer" },
          { text: "Wipe down tea prep area" },
          { text: "Rotate baked goods display" },
          { text: "Clean blenders" },
          { text: "Tidy seating area" },
        ],
      },
      {
        name: "Closing Checklist",
        period: "CLOSING",
        items: [
          { text: "Empty and clean water boilers" },
          { text: "Seal and store loose tea properly" },
          { text: "Clean blenders and smoothie station" },
          { text: "Wash all teapots and cups" },
          { text: "Wipe counters and sanitize surfaces" },
          { text: "Sweep and mop floors" },
          { text: "Take out trash" },
          { text: "Lock up and set alarm" },
        ],
      },
    ],
    suppliers: [
      { name: "Tea Importer", notes: "Monthly tea order" },
      { name: "Produce Supplier", notes: "Weekly fruit delivery" },
      { name: "Bakery Partner", notes: "Daily scone delivery" },
    ],
  },
];

export function getTemplateById(id: string): CafeTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
