import DxfParser from 'dxf-parser';

const dxfContent = `  0
SECTION
  2
ENTITIES
  0
LINE
  5
1
 10
0.0
 20
0.0
 11
10.0
 21
10.0
  0
ARC
  5
2
 10
0.0
 20
0.0
 40
10.0
 50
0.0
 51
90.0
  0
SPLINE
  5
3
 10
0.0
 20
0.0
 10
10.0
 20
10.0
 10
20.0
 20
0.0
 40
3
 70
8
 71
3
 72
4
 73
3
 74
0
  0
ENDSEC
  0
EOF
`;

const parser = new DxfParser();
const parsed = parser.parseSync(dxfContent);
console.log(JSON.stringify(parsed.entities, null, 2));
