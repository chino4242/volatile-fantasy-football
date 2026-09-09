import { render, screen } from '@testing-library/react';
import { AppHeader } from '@/components/AppHeader';
import { vi } from 'vitest';

// Mock useAuth
vi.mock('@/hooks/useUser', () => ({
    useAuth: () => ({
        sleeperUsername: null,
        fleaflickerUsername: null,
    }),
}));

// Mock next/image
vi.mock('next/image', () => ({
    default: (props: any) => <img {...props} />,
}));

// Mock InstallPWA
vi.mock('@/components/InstallPWA', () => ({
    InstallPWA: () => null,
}));

// Mock the season-mode toggle control (its own behavior is tested elsewhere);
// season visibility is driven by the mocked useSeasonMode below.
vi.mock('@/components/SeasonModeToggle', () => ({
    SeasonModeToggle: () => null,
}));

// Controllable season mode: 'both' + current mode are visible.
let mockMode: 'off-season' | 'in-season' = 'in-season';
vi.mock('@/hooks/useSeasonMode', () => ({
    useSeasonMode: () => ({
        mode: mockMode,
        setMode: vi.fn(),
        toggle: vi.fn(),
        loaded: true,
        showFor: (season: string) => season === 'both' || season === mockMode,
    }),
}));

describe('AppHeader Component', () => {
    it('should render the logo and branding', () => {
        render(<AppHeader />);

        // Check for the logo image
        const logo = document.querySelector('img[alt="VFF"]');
        expect(logo).toBeInTheDocument();

        // Desktop Branding
        expect(screen.getByText('Volatile Fantasy Football')).toBeInTheDocument();
        // Mobile Branding
        expect(screen.getByText('VFF')).toBeInTheDocument();
    });

    it('should render always-on navigation links', () => {
        mockMode = 'in-season';
        render(<AppHeader />);

        // Logged-out state (mocked auth has no usernames) → "Connect League"
        // plus the always-present Players / Admin links.
        const connectLink = screen.getByRole('link', { name: 'Connect League' });
        const playersLink = screen.getByRole('link', { name: 'Players' });
        const adminLink = screen.getByRole('link', { name: 'Admin' });

        expect(connectLink).toBeInTheDocument();
        expect(connectLink).toHaveAttribute('href', '/');

        expect(playersLink).toBeInTheDocument();
        expect(playersLink).toHaveAttribute('href', '/players');

        expect(adminLink).toBeInTheDocument();
        expect(adminLink).toHaveAttribute('href', '/admin');
    });

    it('hides the off-season Cheat Sheet link in in-season mode', () => {
        mockMode = 'in-season';
        render(<AppHeader />);
        expect(screen.queryByRole('link', { name: 'Cheat Sheet' })).not.toBeInTheDocument();
    });

    it('shows the Cheat Sheet link in off-season mode', () => {
        mockMode = 'off-season';
        render(<AppHeader />);
        const cheatSheetLink = screen.getByRole('link', { name: 'Cheat Sheet' });
        expect(cheatSheetLink).toBeInTheDocument();
        expect(cheatSheetLink).toHaveAttribute('href', '/cheat-sheet');
    });
});
