import 'dotenv/config';

/**
 * One-off, idempotent: add ROS detail columns to player_values so the weekly
 * Rest-of-Season upload can store PPG, strength-of-schedule ranks, and bye week
 * (previously only overall/pos/tier were captured). Safe to re-run.
 *
 *   npx tsx scripts/add-ros-detail-columns.ts
 */
async function main() {
    const { db } = await import('../src/db');
    const { sql } = await import('drizzle-orm');

    await db.execute(sql`
        ALTER TABLE player_values
            ADD COLUMN IF NOT EXISTS rank_ros_ppg numeric(6,2),
            ADD COLUMN IF NOT EXISTS ros_sos integer,
            ADD COLUMN IF NOT EXISTS ros_next4_sos integer,
            ADD COLUMN IF NOT EXISTS bye_week integer;
    `);
    console.log('✅ player_values ROS detail columns ready (rank_ros_ppg, ros_sos, ros_next4_sos, bye_week).');
    process.exit(0);
}
main().catch(err => { console.error('❌ failed:', err); process.exit(1); });
