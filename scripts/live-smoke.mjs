const siteUrl = String(process.env.AUDITFLOW_SITE_URL || 'https://ste.quadrate.lk').replace(/\/$/, '')
const expected = String(process.env.EXPECTED_COMMIT || '').trim()

async function check(url, label) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${label} returned ${response.status}`)
  return response
}

await check(`${siteUrl}/`, 'Pages site')
const healthResponse = await check(`${siteUrl}/api/health`, 'Worker health')
const health = await healthResponse.json()
if (!health.ok || health.databaseConfigured !== true) throw new Error(`Worker health is not ready: ${JSON.stringify(health)}`)
if (expected && health.deploymentVersion !== expected) throw new Error(`Worker commit ${health.deploymentVersion || 'missing'} does not match ${expected}`)
console.log(JSON.stringify({ site: siteUrl, health: { ok: health.ok, databaseConfigured: health.databaseConfigured, deploymentVersion: health.deploymentVersion || 'local' } }))
