import { render, screen } from '@testing-library/react';
import { AppHeader } from '@/components/AppHeader';

describe('AppHeader Component', () => {
    it('should render the logo and branding', () => {
        render(<AppHeader />);

        // Check for the Logo icon based on the Lucide SVG element presence
        expect(document.querySelector('svg.lucide-trophy')).toBeInTheDocument();

        // Desktop Branding
        expect(screen.getByText('The Proving Ground')).toBeInTheDocument();
        // Mobile Branding
        expect(screen.getByText('Volatile')).toBeInTheDocument();
    });

    it('should render navigation links', () => {
        render(<AppHeader />);

        const leagueLink = screen.getByRole('link', { name: 'League' });
        const playersLink = screen.getByRole('link', { name: 'Players' });

        expect(leagueLink).toBeInTheDocument();
        expect(leagueLink).toHaveAttribute('href', '/league/1200992049558454272');

        expect(playersLink).toBeInTheDocument();
        expect(playersLink).toHaveAttribute('href', '/players');
    });
});
