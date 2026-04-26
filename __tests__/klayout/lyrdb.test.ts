import { parseLyrdb, writeLyrdb, rectPolygon, type LyrdbItem } from '@/lib/klayout/lyrdb';

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<report-database>
  <description>DRC results</description>
  <generator>klayout</generator>
  <top-cell>TOP</top-cell>
  <categories>
    <category>
      <name>min_width</name>
      <description>min width 0.18</description>
    </category>
    <category>
      <name>min_spacing</name>
    </category>
  </categories>
  <cells>
    <cell><name>TOP</name></cell>
  </cells>
  <items>
    <item>
      <category>min_width</category>
      <cell>TOP</cell>
      <severity>error</severity>
      <values>
        <value>text: "Wire too narrow"</value>
        <value>polygon: (0,0;100,0;100,40;0,40)</value>
      </values>
    </item>
    <item>
      <category>min_spacing</category>
      <cell>TOP</cell>
      <values>
        <value>text: "Spacing 0.05 &lt; 0.10"</value>
      </values>
    </item>
  </items>
</report-database>
`;

describe('lyrdb parser', () => {
  it('reads categories, cells, items, and decodes XML entities', () => {
    const f = parseLyrdb(SAMPLE);
    expect(f.topCell).toBe('TOP');
    expect(f.categories.map(c => c.name)).toEqual(['min_width', 'min_spacing']);
    expect(f.categories[0].description).toBe('min width 0.18');
    expect(f.cells).toEqual(['TOP']);

    expect(f.items).toHaveLength(2);
    const [a, b] = f.items;
    expect(a.category).toBe('min_width');
    expect(a.severity).toBe('error');
    expect(a.texts).toEqual(['Wire too narrow']);
    expect(a.polygons).toHaveLength(1);
    expect(a.polygons[0]).toEqual([
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 100, y: 40 }, { x: 0, y: 40 },
    ]);

    expect(b.texts).toEqual(['Spacing 0.05 < 0.10']); // decoded &lt;
    expect(b.severity).toBeUndefined();
  });

  it('handles missing report-database root gracefully', () => {
    const f = parseLyrdb('<not-a-database/>');
    expect(f.items).toHaveLength(0);
    expect(f.categories).toHaveLength(0);
  });
});

describe('lyrdb writer', () => {
  it('emits a structurally-valid XML that round-trips through the parser', () => {
    const items: LyrdbItem[] = [
      {
        category: 'min_width',
        cell: 'TOP',
        texts: ['Wire "X" < 0.18'],
        polygons: [rectPolygon({ xl: 0, yl: 0, xh: 5, yh: 5 })],
        severity: 'error',
      },
      {
        category: 'min_spacing',
        cell: 'TOP',
        texts: ['Spacing 0.05 < 0.10'],
        polygons: [],
      },
    ];
    const xml = writeLyrdb(items, { description: 'unit test', generator: 'jest', topCell: 'TOP' });
    const parsed = parseLyrdb(xml);
    expect(parsed.topCell).toBe('TOP');
    expect(parsed.items).toHaveLength(2);

    const [a, b] = parsed.items;
    expect(a.category).toBe('min_width');
    expect(a.severity).toBe('error');
    expect(a.texts[0]).toBe('Wire "X" < 0.18');
    expect(a.polygons[0]).toHaveLength(4);

    expect(b.category).toBe('min_spacing');
    expect(b.severity).toBeUndefined();
  });

  it('is robust to a single-item database with empty values', () => {
    const xml = writeLyrdb(
      [{ category: 'misc', texts: [], polygons: [] }],
      {},
    );
    const parsed = parseLyrdb(xml);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].texts).toHaveLength(0);
    expect(parsed.items[0].polygons).toHaveLength(0);
  });
});
