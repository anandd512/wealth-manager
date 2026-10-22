// Run after the installer has been signed. Signing changes the file's bytes, so the
// SHA-512, size and block map electron-builder recorded at build time no longer
// match — and electron-updater refuses an update whose hash doesn't match latest.yml.
// This regenerates the block map and rewrites latest.yml for the signed installer.
//
// Usage: node scripts/finalize-signed-installer.cjs [releaseDir]

const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')
const yaml = require('js-yaml')
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap')

async function main() {
  const releaseDir = process.argv[2] ?? 'release'
  const latestPath = join(releaseDir, 'latest.yml')
  const latest = yaml.load(readFileSync(latestPath, 'utf-8'))

  const installer = join(releaseDir, latest.path)
  const { sha512, size } = await buildBlockMap(installer, 'gzip', `${installer}.blockmap`)

  latest.sha512 = sha512
  for (const file of latest.files) {
    if (file.url === latest.path) {
      file.sha512 = sha512
      file.size = size
    }
  }
  writeFileSync(latestPath, yaml.dump(latest, { lineWidth: -1 }))
  console.log(`Updated ${latestPath} for ${latest.path} (${size} bytes)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
