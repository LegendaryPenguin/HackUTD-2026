import type { Dataset, Network, Ops, Telemetry } from './types';

/**
 * Fast long -> wide CSV parse. ~400k rows in well under a second.
 * Columns: timestamp, ts_unix, asset_id, metric, value
 */
export function parseTelemetry(text: string): Telemetry {
  // first pass: collect distinct ts and keys
  const tsSet = new Set<number>();
  const keyRows: { key: string; ts: number; v: number }[] = [];
  let pos = text.indexOf('\n') + 1; // skip header
  const n = text.length;
  while (pos < n) {
    let end = text.indexOf('\n', pos);
    if (end === -1) end = n;
    if (end > pos) {
      const line = text.charCodeAt(end - 1) === 13 ? text.slice(pos, end - 1) : text.slice(pos, end);
      const c1 = line.indexOf(',');
      const c2 = line.indexOf(',', c1 + 1);
      const c3 = line.indexOf(',', c2 + 1);
      const c4 = line.indexOf(',', c3 + 1);
      if (c4 > 0) {
        const ts = +line.slice(c1 + 1, c2);
        const key = line.slice(c2 + 1, c3) + '|' + line.slice(c3 + 1, c4);
        const v = +line.slice(c4 + 1);
        tsSet.add(ts);
        keyRows.push({ key, ts, v });
      }
    }
    pos = end + 1;
  }
  const tsArr = Int32Array.from([...tsSet].sort((a, b) => a - b));
  const tsIndex = new Map<number, number>();
  tsArr.forEach((t, i) => tsIndex.set(t, i));
  const series = new Map<string, Float32Array>();
  for (const r of keyRows) {
    let arr = series.get(r.key);
    if (!arr) {
      arr = new Float32Array(tsArr.length).fill(NaN);
      series.set(r.key, arr);
    }
    arr[tsIndex.get(r.ts)!] = r.v;
  }
  const metrics = new Map<string, string[]>();
  for (const k of series.keys()) {
    const [asset, metric] = k.split('|');
    const list = metrics.get(asset) ?? [];
    list.push(metric);
    metrics.set(asset, list);
  }
  return { ts: tsArr, series, metrics };
}

export async function fetchDataset(name: string, onProgress?: (msg: string) => void): Promise<Dataset> {
  onProgress?.('Loading network…');
  const [network, ops] = await Promise.all([
    fetch(`/data/${name}/network.json`).then((r) => r.json() as Promise<Network>),
    fetch(`/data/${name}/ops.json`).then((r) => r.json() as Promise<Ops>),
  ]);
  onProgress?.('Streaming telemetry…');
  const text = await fetch(`/data/${name}/telemetry.csv`).then((r) => r.text());
  onProgress?.('Indexing sensors…');
  const telemetry = parseTelemetry(text);
  return { name, network, ops, telemetry };
}

export async function listDatasets(): Promise<string[]> {
  try {
    const r = await fetch('/data/index.json', { cache: 'no-store' });
    if (!r.ok) return [];
    const j = (await r.json()) as string[];
    return j;
  } catch {
    return [];
  }
}

/** Load from a user-picked folder (input webkitdirectory) */
export async function datasetFromFiles(files: FileList, onProgress?: (m: string) => void): Promise<Dataset> {
  const find = (n: string) => Array.from(files).find((f) => f.name.toLowerCase() === n);
  const net = find('network.json');
  const ops = find('ops.json');
  const tel = find('telemetry.csv');
  if (!net || !ops || !tel) throw new Error('Folder must contain network.json, ops.json and telemetry.csv');
  onProgress?.('Reading files…');
  const [network, opsJ, text] = await Promise.all([
    net.text().then((t) => JSON.parse(t) as Network),
    ops.text().then((t) => JSON.parse(t) as Ops),
    tel.text(),
  ]);
  onProgress?.('Indexing sensors…');
  const rel = (tel as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
  const name = rel.split('/')[0] || 'custom';
  return { name, network, ops: opsJ, telemetry: parseTelemetry(text) };
}
