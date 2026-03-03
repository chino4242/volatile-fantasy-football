import { db } from "@/db";
import { players, weeklyPlayerStats } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function getPlayerStats(gsisId: string) {
  return await db
    .select()
    .from(weeklyPlayerStats)
    .where(eq(weeklyPlayerStats.gsis_id, gsisId))
    .orderBy(desc(weeklyPlayerStats.season), desc(weeklyPlayerStats.week));
}
