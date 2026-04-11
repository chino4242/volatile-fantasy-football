import { test, expect } from '@playwright/test';

test.describe('Critical User Journey: Navigation & Rendering', () => {

    test('Should navigate from Home -> Players -> League -> Team successfully', async ({ page, isMobile }) => {
        // 1. Home Page
        await page.goto('/');
        await expect(page).toHaveTitle(/Volatile Fantasy Football/);
        await expect(page.getByRole('heading', { name: 'Volatile Fantasy Football' })).toBeVisible();

        // 2. Navigate to Players Page
        await page.getByRole('link', { name: 'Or browse all players →' }).click();      
        await expect(page.getByRole('heading', { name: 'All Players (Top 50)' })).toBeVisible();        await expect(page.locator('table')).toBeVisible(); // Make sure the table renders

        // 3. Navigate back Home using the header
        if (isMobile) {
            // In mobile, header text changes to "Volatile"
            await page.getByRole('link', { name: 'Volatile' }).click();
        } else {
            await page.getByRole('link', { name: 'Volatile Fantasy Football' }).click();
        }
        await expect(page.getByRole('heading', { name: 'Volatile Fantasy Football' })).toBeVisible();

        // 4. Navigate to League Dashboard (unauthenticated "Sleeper" link)
        await page.getByRole('link', { name: 'Sleeper', exact: true }).click();
        // The league dashboard heading usually contains "League Dashboard" or the platform name
        await expect(page.locator('h1')).toBeVisible(); 
        await expect(page.locator('table')).toBeVisible();

        // 5. Navigate to a specific Team page
        // Find the first link that looks like a team link
        const firstTeamLink = page.locator('a[href*="/team/"]').first();
        await firstTeamLink.click();

        // We expect the back to league link to exist
        await expect(page.getByRole('link', { name: '← Back to League' })).toBeVisible();
        await expect(page.locator('table')).toBeVisible(); // Roster table must render
    });

});
