import type { DigestRow, Night } from '../digest/types.js';

const NONE = '—';

// Retries of 3 or more, or a last status of fail, are marked.
function isWarn(row: DigestRow) {
  return row.retries >= 3 || row.lastStatus === 'fail';
}

export function Digest({ night, data }: { night: string; data: Night }) {
  const n = data.unreadable.length;
  return (
    <>
      <h1>digest {night}</h1>
      {data.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr class={isWarn(row) ? 'warn' : undefined}>
                <td>{row.job}</td>
                <td>{row.owner ?? NONE}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{row.lastError ?? NONE}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {n > 0 && (
        <>
          <p>
            {n} {n === 1 ? 'line' : 'lines'} could not be read
          </p>
          <ul>
            {data.unreadable.map((u) => (
              <li>
                line {u.line}, cut off at {u.at ?? 'time unknown'}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
