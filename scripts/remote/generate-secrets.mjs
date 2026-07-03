import { randomBytes } from 'node:crypto'
import { hostname } from 'node:os'

const hostId =
  process.argv[2] ??
  hostname()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .toLowerCase()
const hostToken = createSecret()
const accessToken = createSecret()

console.log(`OXOX_REMOTE_HOST_ID=${hostId}`)
console.log(`OXOX_RELAY_HOST_TOKEN=${hostToken}`)
console.log(`OXOX_REMOTE_HOST_TOKEN=${hostToken}`)
console.log(`OXOX_REMOTE_ACCESS_TOKEN=${accessToken}`)
console.log('')
console.log('Use this phone login URL after replacing <cloudflare-url>:')
console.log(`https://<cloudflare-url>/remote/login?hostId=${hostId}&token=${accessToken}`)

function createSecret() {
  return randomBytes(32).toString('base64url')
}
