# Chamfer Behavior

This document records the current state and behavior of the chamfering logic in the application.

## Overview

The chamfering logic is applied to sharp corners that cut into the usable material (glass or backing). It replaces a single sharp corner point with two new points, creating a flat edge (the chamfer) of a specified length.

## Corner Analysis

Corners are analyzed in `src/geometry/corners.ts` (`analyzeCorners` function):

1.  **Angle Calculation**: For each vertex, the interior angle is calculated using `getInteriorAngle`. In our Y-down coordinate system:
    *   For a CCW polygon (perimeter), a left turn means the interior angle is < 180°, and a right turn means > 180°.
    *   For a CW polygon (hole), a left turn means the interior angle is > 180°, and a right turn means < 180°.
2.  **Material Angle**: The angle of the material itself is determined:
    *   For perimeters (CCW), the material is on the inside: `interiorAngle`.
    *   For holes (CW), the material is on the outside: `360 - interiorAngle`.
3.  **Conditions for Chamfering**: A corner is flagged for chamfering if:
    *   It is an external corner (`materialAngle < 179.99°`).
    *   The corner is strictly acute (`materialAngle < tol.acute_threshold_deg`, which is set to `90°`).
    *   The target material is `glass` or `backing`. (For `vinyl`, a fillet is used instead).

### Holes vs. Perimeters (Visual Behavior)

Because of how material angles are calculated:
*   **On a Perimeter (e.g., a star-shaped outer cut):** The outer points jut out into empty space, making them *external* corners to the material. If they are < 90°, they get chamfered. The inner "armpits" cut into the material, making them *internal* corners, so they do NOT get chamfered.
*   **On a Hole (e.g., a star-shaped cutout):** The material is on the *outside* of the line. The inner "armpits" of the star jut out into the solid glass/backing, making them *external* corners to the material. If they are < 90°, they get chamfered. The outer points of the star cut into the empty hole, making them *internal* corners to the material, so they do NOT get chamfered.

## Chamfer Application

The chamfer is applied in `src/geometry/builders/glass.ts` and `src/geometry/builders/backing.ts` (`applyChamfers` function):

1.  **Application Order**: The chamfer is applied to the *original* cut lines (perimeter and holes) *before* any offset operations.
2.  **Skip Condition**: If `chamferLength <= 0`, the polygon is returned unchanged.
3.  **Iteration**: The algorithm iterates through each point of the original polygon. If a point is flagged for a chamfer:
    *   **Vectors**: It calculates vectors to the previous (`v1`) and next (`v2`) points.
    *   **Distance Calculation**: It calculates the distance `d` from the corner vertex to the new chamfer vertices along the adjacent edges.
        *   Formula: `d = (chamferLength / 2) / Math.sin(angleRad / 2)`
        *   This ensures that the resulting chamfer edge has exactly the length specified by `chamferLength` on the *original cut line*.
    *   **Distance Capping**: To prevent the chamfer from overshooting short edges, `d` is capped at half the length of the shortest adjacent edge: `maxD = Math.min(len1, len2) / 2`.
    *   **Point Replacement**: The original corner point is replaced by two new points, `t1` and `t2`, located at distance `d` along `v1` and `v2` respectively.
4.  **Unchanged Points**: Points not flagged for chamfering are kept as is.
5.  **Offsetting**: After the original cut lines are chamfered, the `offsetPolygon` operation is performed. Because the chamfer creates a flat edge (two obtuse angles), the offset operation naturally offsets this flat edge. The final chamfer length on the offset line (e.g., the glass edge) is determined purely by the offset distance and direction, rather than being a fixed length.

## Configuration

*   The `chamferLength` is configurable per profile in the application state (e.g., `P6`, `P8`).
*   The `acute_threshold_deg` is defined in the tolerances configuration (`DEFAULT_TOLERANCES` in `src/geometry/types.ts`) and is strictly set to `90` to only target true acute angles.
