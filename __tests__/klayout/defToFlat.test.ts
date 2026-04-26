import { defToFlat, pickNetAt, pickCellAt, OUTLINE_LAYER } from '@/lib/klayout/defToFlat';
import { parseLef } from '@/lib/parsers/lef';
import { parseDef } from '@/lib/parsers/def';

const LEF = `
SITE core
  CLASS CORE ;
  SIZE 0.2 BY 1.4 ;
  SYMMETRY Y ;
END core

MACRO INV
  CLASS CORE ;
  ORIGIN 0 0 ;
  SIZE 0.4 BY 1.4 ;
  SITE core ;
  PIN A
    DIRECTION INPUT ;
    PORT
      LAYER li1 ;
      RECT 0.05 0.5 0.15 0.9 ;
    END
  END A
  PIN Y
    DIRECTION OUTPUT ;
    PORT
      LAYER li1 ;
      RECT 0.25 0.5 0.35 0.9 ;
    END
  END Y
  OBS
    LAYER met1 ;
    RECT 0 0 0.4 0.05 ;
  END
END INV
`;

const DEF = `
VERSION 5.8 ;
DESIGN top ;
UNITS DISTANCE MICRONS 1000 ;
DIEAREA ( 0 0 ) ( 10000 10000 ) ;
COMPONENTS 2 ;
  - u1 INV + PLACED ( 0 0 ) N ;
  - u2 INV + PLACED ( 1000 0 ) FN ;
END COMPONENTS
NETS 1 ;
  - n1 ( u1 Y ) ( u2 A ) ;
END NETS
END DESIGN
`;

describe('defToFlat', () => {
  it('produces an outline layer plus pin-layer rects per placed cell', () => {
    const lef = parseLef(LEF);
    const def = parseDef(DEF);
    const flat = defToFlat(def, lef);

    // Top cell name from DEF DESIGN
    expect(flat.topCell).toBe('top');

    // Outline layer present + has 2 rects (one per component).
    const outline = flat.layers.find(l => l.layer === OUTLINE_LAYER);
    expect(outline).toBeDefined();
    // After unionRects, two non-touching outlines stay as 2.
    expect(outline!.rects.length).toBeGreaterThanOrEqual(2);

    // li1 layer present with pin rects.
    const li1 = flat.layers.find(l => flat.layerMap.get('li1') === l.layer);
    expect(li1).toBeDefined();
    expect(li1!.rects.length).toBeGreaterThanOrEqual(2);

    // Bbox derives from DIEAREA: 10000 DBU / 1000 dbu/µm = 10 µm.
    expect(flat.bbox).toEqual({ xl: 0, yl: 0, xh: 10, yh: 10 });
  });

  it('honours the FN orient — flipped pin Y now appears on the right side mirrored', () => {
    const lef = parseLef(LEF);
    const def = parseDef(DEF);
    const flat = defToFlat(def, lef);

    // u2 placed at (1, 0) µm with orient FN. The original Y pin lives at
    // x ∈ [0.25, 0.35]; after FN (mirror about Y, W=0.4) it lives at
    // x ∈ [0.05, 0.15], so chip-space [1.05, 1.15].
    const li1 = flat.layers.find(l => flat.layerMap.get('li1') === l.layer)!;
    const hasMirrored = li1.rects.some(r => r.xl >= 1.04 && r.xh <= 1.16);
    expect(hasMirrored).toBe(true);
  });

  it('counts shapes (non-zero) and assigns sequential layer ids starting at 200', () => {
    const lef = parseLef(LEF);
    const def = parseDef(DEF);
    const flat = defToFlat(def, lef);

    expect(flat.shapeCount).toBeGreaterThan(0);
    expect(flat.layerMap.get('li1')).toBe(200);
    expect(flat.layerMap.get('met1')).toBe(201);
  });

  it('builds a netIndex from DEF NETS and lets pickNetAt find a net by point', () => {
    const lef = parseLef(LEF);
    const def = parseDef(DEF);
    const flat = defToFlat(def, lef);

    expect(flat.netIndex.has('n1')).toBe(true);
    // n1 connects u1.Y and u2.A — at least 2 rects.
    expect((flat.netIndex.get('n1') ?? []).length).toBeGreaterThanOrEqual(2);

    // u1.Y pin in macro is at x∈[0.25,0.35], y∈[0.5,0.9] (orient N, placed
    // at (0,0)). Pick a point inside that rect — should match net n1.
    expect(pickNetAt(flat, 0.30, 0.7)).toBe('n1');

    // A point clearly outside any pin returns null.
    expect(pickNetAt(flat, 5, 5)).toBeNull();
  });

  it('pickCellAt finds the component instance under a point', () => {
    const lef = parseLef(LEF);
    const def = parseDef(DEF);
    const flat = defToFlat(def, lef);

    // u1 placed at (0, 0), size 0.4 × 1.4.
    expect(pickCellAt(flat, 0.2, 0.7)).toBe('u1');
    // u2 placed at (1, 0), FN keeps the footprint same shape.
    expect(pickCellAt(flat, 1.2, 0.7)).toBe('u2');
    expect(pickCellAt(flat, 5, 5)).toBeNull();
  });
});
