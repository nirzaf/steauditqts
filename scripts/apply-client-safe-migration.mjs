import { execFileSync } from 'node:child_process'

const database = 'quadrate-db'
const wrangler = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function run(args) {
  const shellArgs = args.map((arg, index) => args[index - 1] === '--command' ? `"${String(arg).replaceAll('"', '\\"')}"` : arg)
  return execFileSync(wrangler, ['wrangler', 'd1', 'execute', database, '--remote', ...shellArgs], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

function parseRows(output) {
  try {
    const parsed = JSON.parse(output)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list.flatMap((item) => Array.isArray(item?.results) ? item.results : [])
  } catch {
    return []
  }
}

// CREATE IF NOT EXISTS makes the new run/message/upload tables safe to apply
// on every deployment. Receipt columns are handled separately because SQLite
// has no portable ALTER TABLE ... ADD COLUMN IF NOT EXISTS form.
run(['--file', 'worker/migrations/0011_client_safe_demo.sql'])
const rows = parseRows(run(['--command', "SELECT name FROM pragma_table_info('auditflow_pbc_receipts')", '--json']))
const existing = new Set(rows.map((row) => row.name))
const columns = [
  ['run_id', "TEXT NOT NULL DEFAULT ''"],
  ['object_key', "TEXT NOT NULL DEFAULT ''"],
  ['content_sha256', "TEXT NOT NULL DEFAULT ''"],
  ['expires_at', "TEXT NOT NULL DEFAULT ''"],
  ['storage_state', "TEXT NOT NULL DEFAULT 'RECEIVED'"],
  ['storage_error', "TEXT NOT NULL DEFAULT ''"],
]
for (const [name, definition] of columns) {
  if (!existing.has(name)) run(['--command', `ALTER TABLE auditflow_pbc_receipts ADD COLUMN ${name} ${definition}`])
}
console.log(`Client-safe AuditFlow schema is ready in ${database}.`)
