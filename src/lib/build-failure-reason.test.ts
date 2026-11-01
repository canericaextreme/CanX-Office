import { describe, it, expect } from 'vitest';
import { buildFailureReason } from './build-failure-reason';

const jobs = (...steps: [string, string][]) => ({ jobs: [{ conclusion: 'failure', steps: steps.map(([name, conclusion]) => ({ name, conclusion })) }] });

describe('buildFailureReason', () => {
  it('names a builder that ran out of steps or budget in plain words', () => {
    const text = buildFailureReason(jobs(['Install locked dependencies', 'success'], ['Implement requested change', 'failure'], ['Verify candidate', 'skipped']));
    expect(text).toContain('Stopped at "Implement requested change"');
    expect(text).toContain('Split the request');
  });
  it('separates failed tests from a builder that gave up', () => {
    expect(buildFailureReason(jobs(['Implement requested change', 'success'], ['Verify candidate', 'failure']))).toContain('tests or build failed');
  });
  it('reports a run with no code change from the second job', () => {
    const body = { jobs: [{ conclusion: 'success', steps: [{ name: 'Verify candidate', conclusion: 'success' }] }, { conclusion: 'failure', steps: [{ name: 'Open draft change', conclusion: 'failure' }] }] };
    expect(buildFailureReason(body)).toContain('no usable code change');
  });
  it('names an unknown step without guessing a reason', () => {
    expect(buildFailureReason(jobs(['Something new', 'failure']))).toBe(' Stopped at "Something new".');
  });
  it('returns nothing for unreadable or passing runs', () => {
    expect(buildFailureReason(null)).toBe('');
    expect(buildFailureReason({ jobs: 'x' })).toBe('');
    expect(buildFailureReason(jobs(['Verify candidate', 'success']))).toBe('');
  });
});
