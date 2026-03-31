import { test, expect } from '@playwright/test';

test.describe('Critical User Journey: Navigation & Rendering', () => {

    test('Should navigate from Home -> Players -> League -> Team successfully', async ({ page, isMobile }) => {
        // 1. Home Page
        await page.goto('/');
        await expect(page).toHaveTitle(/Volatile Fantasy Football/);
        await expect(page.getByRole('heading', { name: 'Volatile Fantasy Football' })).toBeVisible();

        // 2. Navigate to Players Page
        await page.getByRole('link', { name: 'View All Players' }).click();
        await expect(page.getByRole('heading', { name: 'All Players (Top 50)' })).toBeVisible();
        await expect(page.locator('table')).toBeVisible(); // Make sure the table renders

        // 3. Navigate back Home using the header
        if (isMobile) {
            // In mobile, header text changes to "Volatile"
            await page.getByRole('link', { name: 'Volatile' }).click();
        } else {
            await page.getByRole('link', { name: 'Volatile Fantasy Football' }).click();
        }
        await expect(page.getByRole('heading', { name: 'Volatile Fantasy Football' })).toBeVisible();

        // 4. Navigate to League Dashboard
        await page.getByRole('link', { name: 'View My League' }).click();
        await expect(page.getByRole('heading', { name: 'League Dashboard' })).toBeVisible();
        await expect(page.locator('table')).toBeVisible();

        // 5. Navigate to a specific Team page
        // Using the generic link text or row click we implemented earlier
        // "View" text might be hidden on mobile but the link is there and clickable
        // We'll click the first team link in the table by relying on the next/link href pattern
        const firstTeamLink = page.locator('a[href*="/team/"]').first();
        await firstTeamLink.click();

        // We expect the back to league link to exist and some team stats
        await expect(page.getByRole('link', { name: '← Back to League' })).toBeVisible();
        await expect(page.locator('text=Roster ID:')).toBeVisible();
        await expect(page.locator('table')).toBeVisible(); // Roster table must render
    });

});
