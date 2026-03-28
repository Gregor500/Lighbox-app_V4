export function calculateHole1DPositions(L: number, W: number, S_target: number): number[] {
    const M = W / 2;
    
    // 1. Short-line behavior
    if (L <= 2 * M) {
        return [L / 2]; // Place exactly one hole in the center
    }
    
    // 2. Calculate active length
    const L_active = L - 2 * M;
    
    // 3. Determine closest number of intervals
    let N_intervals = Math.round(L_active / S_target);
    
    // Safety fallback: ensure at least 1 interval (2 holes) for normal lines
    if (N_intervals < 1) {
        N_intervals = 1; 
    }
    
    // 4. Calculate actual spacing
    const S_actual = L_active / N_intervals;
    
    // 5. Generate 1D positions
    const positions: number[] = [];
    for (let i = 0; i <= N_intervals; i++) {
        positions.push(M + (i * S_actual));
    }
    
    return positions;
}
