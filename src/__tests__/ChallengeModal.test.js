import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChallengeModal from '../components/dashboard/ChallengeModal';
import { LeagueProvider } from '../context/LeagueContext';

const dummySettings = {
  sport: 'tennis',
  singlesOrDoubles: 'singles',
  challengeSpots: 3,
  leagueName: 'Test',
};

function renderWithProvider(ui, { providerProps, ...renderOptions }) {
  return render(
    <LeagueProvider
      settings={providerProps.settings}
      initialLeagueData={providerProps.initialLeagueData}
    >
      {ui}
    </LeagueProvider>,
    renderOptions,
  );
}

test('ChallengeModal calls onCreated when confirmed with initial IDs', () => {
  const p1 = { id: 'p1', name: 'Alice' };
  const p2 = { id: 'p2', name: 'Bob' };
  const initialLeagueData = {
    rounds: [{ roundNumber: 1, isComplete: false, matches: [] }],
    matches: [],
    seededParticipants: [p1, p2],
  };
  const onCreated = jest.fn();

  renderWithProvider(
    <ChallengeModal
      initialChallengerId="p1"
      initialChallengedId="p2"
      onClose={() => {}}
      onCreated={onCreated}
    />,
    { providerProps: { settings: dummySettings, initialLeagueData } },
  );

  const confirm = screen.getByText(/Confirm Challenge/i);
  fireEvent.click(confirm);
  expect(onCreated).toHaveBeenCalled();
});
