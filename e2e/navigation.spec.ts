import { test, expect } from '@playwright/test';

test.describe('Critical User Journey: Navigation & Rendering', () => {

    test('Should navigate from Home -> Players successfully', async ({ page, isMobile }) => {
        // 1. Home Page
        await page.goto('/');
        await expect(page).toHaveTitle(/Volatile Fantasy Football/);
        await expect(page.getByRole('heading', { name: 'Volatile Fantasy Football' })).toBeVisible();

        // 2. Navigate to Players Page
        await page.getByRole('link', { name: 'Or browse all players →' }).click();      
        await expect(page.getByRole('heading', { name: 'All Players' })).toBeVisible();
        await expect(page.locator('table')).toBeVisible(); // Make sure the table renders

        // 3. Navigate back Home using the header
        if (isMobile) {
            // In mobile, header text changes to "Volatile"
            await page.getByRole('link', { name: 'Volatile' }).click();
        } else {
            await page.getByRole('link', { name: 'Volatile Fantasy Football' }).click();
        }
        await expect(page.getByRole('heading', { name: 'Volatile Fantasy Football' })).toBeVisible();
    });

});
