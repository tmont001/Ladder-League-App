import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Dashboard from '../components/dashboard/Dashboard';
import { LeagueProvider } from '../context/LeagueContext';
import { generateLeague } from '../utils/matchGenerator';
import { ThemeProvider } from '../context/ThemeContext';

// Integration tests that exercise multiple components together

describe('Integration flows', () => {
  test('Challenge button opens ChallengeModal and creates a challenge/match highlight', async () => {
    const settings = {
      singlesOrDoubles: 'singles',
      rounds: 2,
      sport: 'tennis',
      leagueName: 'Test League',
    };
    const playerData = {
      players: [
        { id: 'p1', name: 'Alice', ustaRating: '4.5' },
        { id: 'p2', name: 'Bob', ustaRating: '4.0' },
        { id: 'p3', name: 'Cara', ustaRating: '3.5' },
      ],
    };
    const initialLeagueData = generateLeague(settings, playerData);

    try {
      console.log('Integration test: mounting Dashboard with props...');
      render(
        <ThemeProvider>
          <Dashboard settings={settings} leagueData={initialLeagueData} />
        </ThemeProvider>,
      );
      console.log('Integration test: mounted Dashboard');
    } catch (err) {
      console.error('Mount error:', err);
      throw err;
    }

    // find a Challenge button in the standings table
    const challengeButtons = await screen.findAllByText(/Challenge/i);
    expect(challengeButtons.length).toBeGreaterThan(0);

    // click the second challenge button (avoid top-ranked with no targets)
    fireEvent.click(challengeButtons[1]);

    // modal should show Challenger/Challenging selects — choose values then confirm
    const selects = await screen.findAllByRole('combobox');
    // first select = Challenger, second = Challenging
    fireEvent.change(selects[0], { target: { value: 'p2' } });
    fireEvent.change(selects[1], { target: { value: 'p1' } });
    const createBtn = await screen.findByText(/Confirm Challenge/i);
    fireEvent.click(createBtn);
    // debug snapshot of DOM after confirm (trimmed)
    console.log('DOM after confirm length:', document.body.innerHTML.length);

    // Ensure Schedule tab is visible, then check for a challenge badge
    const scheduleTabBtn = await screen.findByText('Schedule');
    fireEvent.click(scheduleTabBtn);

    await waitFor(
      () => {
        const badge = document.querySelector('.status-badge');
        expect(badge).toBeTruthy();
        expect(badge.textContent).toMatch(/Challenge/);
      },
      { timeout: 2000 },
    );
  });

  test('Ad-hoc match flow opens score entry modal after creating a match', async () => {
    const settings = {
      singlesOrDoubles: 'singles',
      rounds: 2,
      sport: 'tennis',
      leagueName: 'Test League',
    };
    const playerData = {
      players: [
        { id: 'p1', name: 'Alice', ustaRating: '4.5' },
        { id: 'p2', name: 'Bob', ustaRating: '4.0' },
        { id: 'p3', name: 'Cara', ustaRating: '3.5' },
      ],
    };
    const initialLeagueData = generateLeague(settings, playerData);

    try {
      console.log('Integration test (adhoc): mounting Dashboard with props...');
      render(
        <ThemeProvider>
          <Dashboard settings={settings} leagueData={initialLeagueData} />
        </ThemeProvider>,
      );
      console.log('Integration test (adhoc): mounted Dashboard');
    } catch (err) {
      console.error('Mount error (adhoc):', err);
      throw err;
    }

    // Find an "Enter Score" button (there should be at least one)
    const scoreButtons = await screen.findAllByText(/Enter Score/i);
    expect(scoreButtons.length).toBeGreaterThan(0);

    // Click the first Enter Score button which may open an ad-hoc flow
    fireEvent.click(scoreButtons[0]);

    // If Adhoc modal appears, it will show "Create Match" or ScoreEntry modal will appear
    const createMatchBtn = await screen.findByText(
      /Create Match|Submit Score|Save Score/i,
    );
    expect(createMatchBtn).toBeTruthy();
  });
});
