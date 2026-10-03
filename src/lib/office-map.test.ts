import { describe, expect, it } from 'vitest';
import { clockwiseOfficeRooms, OFFICE_MAP_ROOMS } from './office-map';

describe('clockwise room navigation', () => {
  it('starts at Reception and proceeds toward the lower-left rooms', () => {
    const rooms = clockwiseOfficeRooms();
    expect(rooms.slice(0, 3).map(room => room.route)).toEqual(['/reception', '/owner-desk', '/family-continuity']);
    expect(new Set(rooms.map(room => room.route))).toEqual(new Set(OFFICE_MAP_ROOMS.map(room => room.route)));
    expect(rooms).toHaveLength(OFFICE_MAP_ROOMS.length);
  });

  it('uses saved placements without changing the map defaults', () => {
    const rooms = clockwiseOfficeRooms({ '20': { x: 45, y: 78 } });
    expect(rooms[0]?.route).toBe('/reception');
    expect(rooms[1]?.route).toBe('/future');
    expect(OFFICE_MAP_ROOMS.find(room => room.number === '20')?.x).toBe(72);
  });

  it('ignores invalid coordinates', () => {
    expect(clockwiseOfficeRooms({ '20': { x: NaN, y: Infinity } })).toEqual(clockwiseOfficeRooms());
  });
});
