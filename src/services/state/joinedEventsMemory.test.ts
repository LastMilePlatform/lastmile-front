import {
  forgetJoinedEvent,
  getRememberedJoinedEvents,
  rememberJoinedEvent,
  rememberJoinedEvents,
} from './joinedEventsMemory';
import type { EventSummary } from '@/services/api/eventsService';

const makeEvent = (id: number, name = `Event ${id}`): EventSummary => ({
  id,
  name,
  disasterType: 'flood',
  city: 'Bogota',
  description: 'desc',
  date: '2026-01-01',
  createdBy: 1,
});

describe('joinedEventsMemory', () => {
  beforeEach(() => {
    getRememberedJoinedEvents().forEach((e) => forgetJoinedEvent(e.id));
  });

  it('starts empty', () => {
    expect(getRememberedJoinedEvents()).toEqual([]);
  });

  it('remembers a batch of events', () => {
    rememberJoinedEvents([makeEvent(1), makeEvent(2)]);
    expect(getRememberedJoinedEvents()).toHaveLength(2);
  });

  it('remembers a single event', () => {
    rememberJoinedEvent(makeEvent(5));
    expect(getRememberedJoinedEvents()).toHaveLength(1);
    expect(getRememberedJoinedEvents()[0].id).toBe(5);
  });

  it('upserts on duplicate id', () => {
    rememberJoinedEvents([makeEvent(1)]);
    rememberJoinedEvent(makeEvent(1, 'Updated'));
    expect(getRememberedJoinedEvents()).toHaveLength(1);
    expect(getRememberedJoinedEvents()[0].name).toBe('Updated');
  });

  it('forgets a specific event', () => {
    rememberJoinedEvents([makeEvent(1), makeEvent(2)]);
    forgetJoinedEvent(1);
    expect(getRememberedJoinedEvents()).toHaveLength(1);
    expect(getRememberedJoinedEvents()[0].id).toBe(2);
  });

  it('sorts by id descending', () => {
    rememberJoinedEvents([makeEvent(1), makeEvent(3), makeEvent(2)]);
    const ids = getRememberedJoinedEvents().map((e) => e.id);
    expect(ids).toEqual([3, 2, 1]);
  });

  it('forget on unknown id does nothing', () => {
    rememberJoinedEvent(makeEvent(1));
    forgetJoinedEvent(999);
    expect(getRememberedJoinedEvents()).toHaveLength(1);
  });
});
