import { NextRequest, NextResponse } from "next/server";
import { parseRankingsCSV, upsertRankingSource, importRankings } from "@/lib/rankings-upload";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sourceName = formData.get("sourceName") as string;
    const displayName = formData.get("displayName") as string;
    const description = formData.get("description") as string | undefined;
    
    if (!file || !sourceName || !displayName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    
    const csvText = await file.text();
    const rankings = await parseRankingsCSV(csvText);
    
    const sourceId = await upsertRankingSource(sourceName, displayName, description);
    const result = await importRankings(sourceId, rankings);
    
    return NextResponse.json({
      success: true,
      matched: result.matched,
      unmatched: result.unmatched,
      total: rankings.length,
    });
  } catch (error) {
    console.error("Rankings upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload rankings" },
      { status: 500 }
    );
  }
}
