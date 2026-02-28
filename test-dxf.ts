import { decodeDXF } from './src/geometry/decode';
import fs from 'fs';

const dxfContent = `  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  5
1
100
AcDbEntity
  8
0
100
AcDbPolyline
 90
4
 70
1
 10
0.0
 20
0.0
 10
10.0
 20
0.0
 10
10.0
 20
10.0
 10
0.0
 20
10.0
  0
LWPOLYLINE
  5
2
100
AcDbEntity
  8
0
100
AcDbPolyline
 90
4
 70
1
 10
20.0
 20
0.0
 10
30.0
 20
0.0
 10
30.0
 20
10.0
 10
20.0
 20
10.0
  0
ENDSEC
  0
EOF
`;

const diagnostics: any[] = [];
const borders = decodeDXF(dxfContent, { eps_closure_gap: 0.1, eps_collinear: 0.1, eps_point_equality: 0.1 } as any, diagnostics);

console.log(borders.length);
console.log(borders.map(b => b.polygon.points));
