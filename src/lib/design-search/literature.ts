import 'server-only';

export type SearchTopic = 'placement' | 'rtl' | 'rtl_gcd';

export interface LiteratureSource {
  id: string;
  title: string;
  url: string;
  year?: number;
  abstract: string;
  origin: 'OpenROAD' | 'OpenAlex' | 'Reference';
}

const topics: Record<SearchTopic, string> = {
  placement: 'VLSI global placement routability optimization',
  rtl: 'RTL microarchitecture synthesis optimization area delay sequential equivalence hardware',
  rtl_gcd: 'greatest common divisor GCD hardware RTL architecture area delay binary Euclidean',
};

const primaryReferences: LiteratureSource[] = [
  {
    id: 'openroad-gpl',
    title: 'OpenROAD Global Placement documentation',
    url: 'https://openroad.readthedocs.io/en/latest/main/src/gpl/README.html',
    abstract: 'The OpenROAD global placer is based on RePlAce and documents density, timing-driven and routability-driven placement controls. Changes in placement settings require full-flow measurement.',
    origin: 'OpenROAD',
  },
  {
    id: 'replace-paper',
    title: 'RePlAce: Advancing Solution Quality and Routability Validation in Global Placement',
    url: 'https://vlsicad.ucsd.edu/Publications/Journals/j126.pdf',
    year: 2019,
    abstract: 'Research paper underlying OpenROAD global placement. Use it to form testable placement hypotheses; evaluate against routed timing and DRC rather than a placement proxy alone.',
    origin: 'OpenROAD',
  },
  {
    id: 'orfs-autotuner',
    title: 'OpenROAD Flow Scripts AutoTuner',
    url: 'https://github.com/The-OpenROAD-Project/OpenROAD-flow-scripts/blob/master/docs/user/InstructionsForAutoTuner.md',
    abstract: 'The official ORFS AutoTuner supports parameter sweeps and optimization methods using measured PPA from actual flow trials.',
    origin: 'OpenROAD',
  },
];

const rtlReferences: LiteratureSource[] = [{
  id: 'eqy-sequential-equivalence',
  title: 'YosysHQ EQY sequential equivalence documentation',
  url: 'https://yosyshq.readthedocs.io/projects/eqy/en/latest/quickstart.html',
  abstract: 'EQY checks whether a design refactor preserves behavior. Candidate architecture changes require a completed equivalence proof as well as independent simulation and physical measurement.',
  origin: 'Reference',
}];

function abstractText(index: unknown): string {
  if (!index || typeof index !== 'object' || Array.isArray(index)) return '';
  const terms: Array<{ word: string; position: number }> = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (typeof position === 'number' && Number.isInteger(position) && position >= 0 && position < 3000)
        terms.push({ word, position });
    }
  }
  return terms.sort((a, b) => a.position - b.position).slice(0, 240).map((term) => term.word).join(' ').slice(0, 1800);
}

export async function discoverLiterature(topic: SearchTopic): Promise<LiteratureSource[]> {
  const references = [...(topic === 'placement' ? primaryReferences : rtlReferences)];
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('search', topics[topic]);
  url.searchParams.set('filter', 'type:article,has_abstract:true');
  url.searchParams.set('select', 'id,display_name,doi,publication_year,abstract_inverted_index');
  url.searchParams.set('per_page', '6');
  try {
    // The query is fixed by topic: private RTL, project names and constraints
    // are never sent to the public literature index.
    const response = await fetch(url, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
    if (!response.ok) return references;
    const payload = await response.json() as { results?: Array<Record<string, unknown>> };
    for (const item of payload.results ?? []) {
      const title = typeof item.display_name === 'string' ? item.display_name.trim().slice(0, 300) : '';
      const doi = typeof item.doi === 'string' ? item.doi : '';
      const abstract = abstractText(item.abstract_inverted_index);
      if (!title || !/^https:\/\/doi\.org\/10\./i.test(doi) || abstract.length < 80) continue;
      const workId = typeof item.id === 'string' ? item.id.match(/\/W\d+$/)?.[0].slice(1) : undefined;
      if (!workId) continue;
      references.push({ id: `openalex-${workId}`, title, url: doi, year: typeof item.publication_year === 'number' ? item.publication_year : undefined, abstract, origin: 'OpenAlex' });
      if (references.length >= 8) break;
    }
  } catch {
    // The primary reference catalog is available when the index is offline.
  }
  return references;
}
