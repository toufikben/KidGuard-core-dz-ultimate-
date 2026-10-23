// The state machine behind "drag on the map to draw a circle", kept free of Leaflet so the real
// gesture decisions can be tested without a browser. The inputs are already-resolved points: screen
// pixels (for the tap tolerance) and coordinates (for the radius). MapView feeds it Pointer Events.
//
// The click a pointer release generates lands at the RELEASE point. While `map.dragging` is disabled,
// Leaflet's own drag-moved suppression is inactive, so without this controller consuming that click
// the circle would be centred on its rim (review 2, Critical). Any release past the tap tolerance is
// a drag and swallows the following click — even when the radius is too small to draw.
import { haversineMeters } from '../../services/traccar/positions.ts';

export interface DragPoint {
  lat: number;
  lon: number;
  x: number;
  y: number;
}

export interface DragPreview {
  center: { lat: number; lon: number };
  radiusMeters: number;
}

export interface DragOutcome {
  drawn: boolean;
  center: { lat: number; lon: number } | null;
  radiusMeters: number;
  draggedPx: number;
}

export interface CircleDragOptions {
  minDragPx?: number;
  minRadiusMeters?: number;
}

export interface CircleDrag {
  begin(point: DragPoint): boolean;
  move(point: DragPoint): DragPreview | null;
  finish(point?: DragPoint): DragOutcome | null;
  cancel(): boolean;
  consumeClickSuppression(): boolean;
  reset(): void;
}

export function createCircleDrag(options: CircleDragOptions = {}): CircleDrag {
  const minDragPx = options.minDragPx ?? 6;
  const minRadiusMeters = options.minRadiusMeters ?? 10;
  let start: DragPoint | null = null;
  let last: DragPoint | null = null;
  let suppressNextClick = false;

  const centerOf = (point: DragPoint) => ({ lat: point.lat, lon: point.lon });
  const metersBetween = (a: DragPoint, b: DragPoint) => haversineMeters(a.lat, a.lon, b.lat, b.lon);
  const pixelsBetween = (a: DragPoint, b: DragPoint) => Math.hypot(b.x - a.x, b.y - a.y);

  return {
    begin(point) {
      // A fresh gesture invalidates whatever the previous one left behind: a tap after a drag must
      // still select its own centre, never be eaten by a stale suppression.
      suppressNextClick = false;
      if (start) return false;
      start = point;
      last = point;
      return true;
    },
    move(point) {
      if (!start) return null;
      last = point;
      return { center: centerOf(start), radiusMeters: metersBetween(start, point) };
    },
    finish(point) {
      if (!start) return null;
      const center = start;
      const end = point ?? last;
      const draggedPx = end ? pixelsBetween(center, end) : 0;
      const radiusMeters = end ? metersBetween(center, end) : 0;
      start = null;
      last = null;
      if (draggedPx >= minDragPx) suppressNextClick = true;
      return {
        drawn: draggedPx >= minDragPx && radiusMeters >= minRadiusMeters,
        center: centerOf(center),
        radiusMeters,
        draggedPx,
      };
    },
    cancel() {
      if (!start) return false;
      const moved = last ? pixelsBetween(start, last) >= minDragPx : false;
      if (moved) suppressNextClick = true;
      start = null;
      last = null;
      return moved;
    },
    consumeClickSuppression() {
      const value = suppressNextClick;
      suppressNextClick = false;
      return value;
    },
    reset() {
      start = null;
      last = null;
      suppressNextClick = false;
    },
  };
}
