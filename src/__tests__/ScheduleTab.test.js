import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScheduleTab from '../components/dashboard/ScheduleTab';
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

test('ScheduleTab highlights and scrolls to highlighted match', () => {
  // mock scrollIntoView
  Element.prototype.scrollIntoView = jest.fn();

  const match = {
    id: 'm1',
    status: 'pending',
    isBye: false,
    p1: { id: 'a', name: 'A' },
    p2: { id: 'b', name: 'B' },
  };
  const rounds = [{ roundNumber: 1, isComplete: false, matches: [match] }];
  const initialLeagueData = {
    rounds,
    matches: [match],
    seededParticipants: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
  };

  renderWithProvider(
    <ScheduleTab
      highlightedMatchId="m1"
      onEnterScore={() => {}}
      onOpenChallenge={() => {}}
    />,
    { providerProps: { settings: dummySettings, initialLeagueData } },
  );

  const el = document.getElementById('match-m1');
  expect(el).toBeInTheDocument();
  expect(el).toHaveClass('match-highlight');
  // scrollIntoView should have been called
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});
