# Chamfer Behavior

This document records the current state and behavior of the chamfering logic in the application.

## Overview

The chamfering logic is applied to sharp corners that cut into the usable material (glass or backing). It replaces a single sharp corner point with two new points, creating a flat edge (the chamfer) of a specified length.

## Corner Analysis

Corners are analyzed in `src/geometry/corners.ts` (`analyzeCorners` function):

1.  **Angle Calculation**: For each vertex, the interior angle is calculated.
2.  **Cut Angle**: The angle of the "empty space" is determined:
    *   For perimeters (counter-clockwise), the empty space is on the outside: `360 - interiorAngle`.
    *   For holes (clockwise), the empty space is on the inside: `interiorAngle`.
3.  **Conditions for Chamfering**: A corner is flagged for chamfering if:
    *   It cuts into the material (`cutAngle < 179.99°`).
    *   The cut is acute (`cutAngle < tol.acute_threshold_deg`).
    *   The target material is `glass` or `backing`. (For `vinyl`, a fillet is used instead).

## Chamfer Application

The chamfer is applied in `src/geometry/builders/glass.ts` and `src/geometry/builders/backing.ts` (`applyChamfers` function):

1.  **Skip Condition**: If `chamferLength <= 0`, the polygon is returned unchanged.
2.  **Iteration**: The algorithm iterates through each point of the polygon. If a point is flagged for a chamfer:
    *   **Vectors**: It calculates vectors to the previous (`v1`) and next (`v2`) points.
    *   **Distance Calculation**: It calculates the distance `d` from the corner vertex to the new chamfer vertices along the adjacent edges.
        *   Formula: `d = (chamferLength / 2) / Math.sin(angleRad / 2)`
        *   This ensures that the resulting chamfer edge has exactly the length specified by `chamferLength`.
    *   **Distance Capping**: To prevent the chamfer from overshooting short edges, `d` is capped at half the length of the shortest adjacent edge: `maxD = Math.min(len1, len2) / 2`.
    *   **Point Replacement**: The original corner point is replaced by two new points, `t1` and `t2`, located at distance `d` along `v1` and `v2` respectively.
3.  **Unchanged Points**: Points not flagged for chamfering are kept as is.

**Note on Original Elements**: In `buildGlass`, the original holes (the "cut" holes) are also chamfered before being mirrored and returned as part of the original element. This ensures that the original hole shape displayed in the UI reflects the chamfers that will be present in the final offset glass hole.

## Configuration

*   The `chamferLength` is configurable per profile in the application state (e.g., `P6`, `P8`).
*   The `acute_threshold_deg` is defined in the tolerances configuration.
