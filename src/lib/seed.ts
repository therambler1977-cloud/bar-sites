import { hashPassword } from "./auth";
import { addDays, localNow } from "./schedule";
import type { Database } from "./store";
import type { MenuItem } from "./types";

const BAR_ID = "demo-bar";
const TIMEZONE = "America/Chicago";

/** A sample bar so the site and admin have something to show before real data exists. */
export function seedData(now = new Date()): Database {
  const today = localNow(now, TIMEZONE).date;
  const menu: [string, string, string, string][] = [
    ["Starters", "Loaded Tots", "Cheddar, bacon, scallions, sour cream", "$9"],
    ["Starters", "Wings (8)", "Buffalo, garlic parm, or honey BBQ", "$13"],
    ["Starters", "Pretzel Bites", "Beer cheese and spicy mustard", "$8"],
    ["Burgers & Sandwiches", "Anchor Burger", "Double smash patty, American, pickles, anchor sauce", "$14"],
    ["Burgers & Sandwiches", "Fried Chicken Sandwich", "Buttermilk thigh, slaw, hot honey", "$13"],
    ["Burgers & Sandwiches", "Black Bean Burger", "Pepper jack, pico, avocado", "$12"],
    ["Tacos", "Street Tacos (3)", "Carne asada or chicken, onion, cilantro", "$11"],
    ["Drinks", "Domestic Draft", "Bud Light, Miller Lite, Coors", "$4"],
    ["Drinks", "Local IPA", "Rotating tap from nearby breweries", "$7"],
    ["Drinks", "House Margarita", "Rocks or frozen", "$8"],
  ];

  return {
    bars: [
      {
        id: BAR_ID,
        slug: "rusty-anchor",
        name: "The Rusty Anchor",
        tagline: "Cold beer, hot food, live music every weekend.",
        timezone: TIMEZONE,
        phone: "(555) 010-4477",
        address: "418 Harbor St, Springfield",
        domains: ["localhost", "127.0.0.1"],
        accentColor: "#e0a33a",
        orderUrl: null,
        smsNumber: "+15550104478",
        ownerPhones: ["+15550001111"],
        adminPasswordHash: hashPassword("demo1234"),
        weeklyHours: {
          0: { open: "11:00", close: "22:00" },
          1: { open: "15:00", close: "23:00" },
          2: { open: "15:00", close: "23:00" },
          3: { open: "15:00", close: "23:00" },
          4: { open: "15:00", close: "00:00" },
          5: { open: "11:00", close: "02:00" },
          6: { open: "11:00", close: "02:00" },
        },
        google: null,
      },
    ],
    events: [
      {
        id: "evt-1",
        barId: BAR_ID,
        title: "The Rusty Nails (live)",
        date: addDays(today, 1),
        startTime: "21:00",
        endTime: "00:00",
        description: "Classic rock and country covers.",
        cover: "$5",
        googlePostName: null,
      },
      {
        id: "evt-2",
        barId: BAR_ID,
        title: "Pub Trivia",
        date: addDays(today, 3),
        startTime: "19:30",
        endTime: "21:30",
        description: "Teams up to 6. Prizes for the top three.",
        cover: "Free",
        googlePostName: null,
      },
      {
        id: "evt-3",
        barId: BAR_ID,
        title: "Karaoke Night",
        date: addDays(today, 5),
        startTime: "20:00",
        endTime: null,
        description: "",
        cover: "Free",
        googlePostName: null,
      },
    ],
    specials: [
      {
        id: "sp-1",
        barId: BAR_ID,
        title: "Taco Tuesday",
        description: "Street tacos and house margaritas.",
        price: "$2 tacos, $5 margs",
        days: [2],
        date: null,
        startTime: "16:00",
        endTime: "21:00",
        active: true,
        googlePostName: null,
      },
      {
        id: "sp-2",
        barId: BAR_ID,
        title: "Happy Hour",
        description: "Domestic drafts and well drinks.",
        price: "$3 drafts, $4 wells",
        days: [1, 2, 3, 4, 5],
        date: null,
        startTime: "15:00",
        endTime: "18:00",
        active: true,
        googlePostName: null,
      },
      {
        id: "sp-3",
        barId: BAR_ID,
        title: "Wing Night",
        description: "Every flavor, all night.",
        price: "75¢ wings",
        days: [4],
        date: null,
        startTime: null,
        endTime: null,
        active: true,
        googlePostName: null,
      },
    ],
    menuItems: menu.map(
      ([category, name, description, price], i): MenuItem => ({
        id: `item-${i + 1}`,
        barId: BAR_ID,
        category,
        name,
        description,
        price,
        available: true,
        sortOrder: i,
      }),
    ),
    hoursOverrides: [],
    pendingUpdates: [],
  };
}
