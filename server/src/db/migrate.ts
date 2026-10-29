import { closeDb, runMigrations } from "./client.js";

runMigrations();
closeDb();

console.log("Migrations applied.");
