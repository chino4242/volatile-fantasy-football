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

    it('should render navigation links', () => {
        render(<AppHeader />);

        const sleeperLink = screen.getByRole('link', { name: 'Sleeper' });
        const fleaflickerLink = screen.getByRole('link', { name: 'Fleaflicker' });
        const playersLink = screen.getByRole('link', { name: 'Players' });
        const adminLink = screen.getByRole('link', { name: 'Admin' });

        expect(sleeperLink).toBeInTheDocument();
        expect(sleeperLink).toHaveAttribute('href', '/league/your-league-id');

        expect(fleaflickerLink).toBeInTheDocument();
        expect(fleaflickerLink).toHaveAttribute('href', '/fleaflicker/your-league-id');

        expect(playersLink).toBeInTheDocument();
        expect(playersLink).toHaveAttribute('href', '/players');

        expect(adminLink).toBeInTheDocument();
        expect(adminLink).toHaveAttribute('href', '/admin');
    });
});
