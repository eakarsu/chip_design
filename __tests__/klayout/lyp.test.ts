import { parseLyp, defaultLypEntry, lypKey } from '@/lib/klayout/lyp';

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<layer-properties>
  <properties>
    <frame-color>#1f77b4</frame-color>
    <fill-color>#aec7e8</fill-color>
    <visible>true</visible>
    <valid>true</valid>
    <transparent>false</transparent>
    <dither-pattern>I3</dither-pattern>
    <name>met1 - drawing</name>
    <source>68/20@1</source>
  </properties>
  <properties>
    <frame-color>#ff7f0e</frame-color>
    <fill-color>#ffbb78</fill-color>
    <visible>false</visible>
    <name>via1</name>
    <source>71/0@1</source>
  </properties>
  <properties>
    <name>Metals</name>
    <group-members>
      <properties>
        <name>met2</name>
        <source>69/20@1</source>
      </properties>
      <properties>
        <name>met3</name>
        <source>70/20@1</source>
      </properties>
    </group-members>
  </properties>
</layer-properties>`;

describe('.lyp parser', () => {
  it('extracts layer/datatype from <source> "L/D@cv"', () => {
    const r = parseLyp(SAMPLE);
    expect(r.layers).toHaveLength(4);
    const m1 = r.layers.find(l => l.name === 'met1 - drawing')!;
    expect(m1.layer).toBe(68);
    expect(m1.datatype).toBe(20);
    expect(m1.fillColor).toBe('#aec7e8');
    expect(m1.visible).toBe(true);
    expect(m1.ditherPattern).toBe('I3');
  });

  it('respects <visible>false</visible>', () => {
    const r = parseLyp(SAMPLE);
    const via = r.layers.find(l => l.name === 'via1')!;
    expect(via.visible).toBe(false);
  });

  it('flattens groups but records the breadcrumb path', () => {
    const r = parseLyp(SAMPLE);
    const m2 = r.layers.find(l => l.name === 'met2')!;
    expect(m2.groupPath).toEqual(['Metals']);
    expect(m2.layer).toBe(69);
  });

  it('supplies defaults for unspecified layer/datatype combos', () => {
    const e = defaultLypEntry(7, 0);
    expect(e.layer).toBe(7);
    expect(e.datatype).toBe(0);
    expect(e.visible).toBe(true);
    expect(e.fillColor).toMatch(/^#/);
    expect(lypKey(7, 0)).toBe('7/0');
  });
});
