"""Where along a route a report lies.

A live route's reports are the route's own traffic sections, so nothing has
to be matched against the line. What is left is the distance along the
route to a point - the state of every report's entity, so the markers read
like the trip: this one at km 3, that one at km 23 - found against a route
of hundreds of segments without measuring every one.

Everything here is plain geometry on a flat projection around the route's
mean latitude: exact enough for tens of metres over tens of kilometres, and
free of anything Home Assistant, so it can be checked on its own.
"""

from __future__ import annotations

from math import cos, hypot, radians

_METERS_PER_DEGREE = 111320.0

# The grid the route's segments are filed in, in metres. A long route is
# hundreds of segments after thinning, and every poll along it brings
# hundreds of candidates; filed by cell, a candidate is measured against the
# handful of segments near it.
_CELL_M = 500.0


def _point_segment(px, py, ax, ay, bx, by) -> tuple[float, float]:
    """Distance from p to the segment a-b, and how far along it the nearest point lies (0-1)."""
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    t = ((px - ax) * dx + (py - ay) * dy) / length2 if length2 else 0.0
    t = max(0.0, min(1.0, t))
    return hypot(px - ax - t * dx, py - ay - t * dy), t


class RouteLine:
    """A route as a line, measured in metres."""

    def __init__(self, points: list[tuple[float, float]]) -> None:
        if not points:
            raise ValueError("a route needs points")
        lat0 = sum(p[0] for p in points) / len(points)
        self._k = cos(radians(lat0))
        self._xy = [self._project(p) for p in points]
        # Distance along the route at each of its points.
        self._along = [0.0]
        for (ax, ay), (bx, by) in zip(self._xy, self._xy[1:]):
            self._along.append(self._along[-1] + hypot(bx - ax, by - ay))
        # Every segment filed under each grid cell its bounding box touches.
        self._cells: dict[tuple[int, int], list[int]] = {}
        for i, ((ax, ay), (bx, by)) in enumerate(zip(self._xy, self._xy[1:])):
            for cell in self._cells_over(min(ax, bx), min(ay, by), max(ax, bx), max(ay, by)):
                self._cells.setdefault(cell, []).append(i)
        xs = [x for x, _ in self._xy]
        ys = [y for _, y in self._xy]
        self._extent = (
            int(min(xs) // _CELL_M), int(min(ys) // _CELL_M),
            int(max(xs) // _CELL_M), int(max(ys) // _CELL_M),
        )

    @property
    def length(self) -> float:
        return self._along[-1]

    def _project(self, point: tuple[float, float]) -> tuple[float, float]:
        return (point[1] * _METERS_PER_DEGREE * self._k, point[0] * _METERS_PER_DEGREE)

    @staticmethod
    def _cells_over(x0, y0, x1, y1):
        for cx in range(int(x0 // _CELL_M), int(x1 // _CELL_M) + 1):
            for cy in range(int(y0 // _CELL_M), int(y1 // _CELL_M) + 1):
                yield (cx, cy)

    def _segments_near(self, x0, y0, x1, y1) -> set[int]:
        found: set[int] = set()
        for cell in self._cells_over(x0, y0, x1, y1):
            found.update(self._cells.get(cell, ()))
        return found

    def _measure(self, px, py, i) -> tuple[float, float, int]:
        (ax, ay), (bx, by) = self._xy[i], self._xy[i + 1]
        dist, t = _point_segment(px, py, ax, ay, bx, by)
        return dist, self._along[i] + t * (self._along[i + 1] - self._along[i]), i

    def nearest(self, point: tuple[float, float], within: float | None = None) -> tuple[float, float, int]:
        """Distance to the route, distance along it to that nearest spot, and
        the index of the route segment it is on.

        With `within`, only the cells that many metres around the point are
        looked at, and a route further away than that is reported as
        infinitely far. Without it the answer is exact whatever the
        distance: the cells are searched ring by ring around the point, and
        the search stops once everything not yet seen must lie further away
        than the nearest segment already found.
        """
        px, py = self._project(point)
        if len(self._xy) == 1:
            ax, ay = self._xy[0]
            return hypot(px - ax, py - ay), 0.0, 0
        if within is not None:
            best = (float("inf"), 0.0, 0)
            for i in self._segments_near(px - within, py - within, px + within, py + within):
                measured = self._measure(px, py, i)
                if measured[0] < best[0]:
                    best = measured
            return best
        cx, cy = int(px // _CELL_M), int(py // _CELL_M)
        x_lo, y_lo, x_hi, y_hi = self._extent
        last_ring = max(abs(cx - x_lo), abs(cx - x_hi), abs(cy - y_lo), abs(cy - y_hi))
        best = (float("inf"), 0.0, 0)
        seen: set[int] = set()
        ring = 0
        while ring <= last_ring:
            for dx in range(-ring, ring + 1):
                dys = (-ring, ring) if abs(dx) != ring else range(-ring, ring + 1)
                for dy in dys:
                    for i in self._cells.get((cx + dx, cy + dy), ()):
                        if i in seen:
                            continue
                        seen.add(i)
                        measured = self._measure(px, py, i)
                        if measured[0] < best[0]:
                            best = measured
            if ring * _CELL_M >= best[0]:
                break
            ring += 1
        return best
