import { spawnSync } from 'node:child_process'

const DEFAULT_DAEMON_PORTS = [37643, 58051, 52043]
const DEFAULT_DAEMON_PORT = 37643

function parseDaemonPort(command: string): number | null {
  const explicitPortMatch = command.match(/--port\s+(\d+)/)

  if (explicitPortMatch) {
    return Number(explicitPortMatch[1])
  }

  if (/\bdroid daemon\b/.test(command)) {
    return DEFAULT_DAEMON_PORT
  }

  return null
}

function readDaemonPortsFromProcesses(): number[] {
  const result = spawnSync('ps', ['-axo', 'command'], {
    encoding: 'utf8',
  })

  if (result.status !== 0 || !result.stdout) {
    return []
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\bdroid daemon\b/.test(line))
    .map((line) => parseDaemonPort(line))
    .filter(
      (port): port is number => typeof port === 'number' && Number.isInteger(port) && port > 0,
    )
}

export async function resolveKnownDaemonPorts(): Promise<number[]> {
  const orderedPorts = [...readDaemonPortsFromProcesses(), ...DEFAULT_DAEMON_PORTS]

  return [...new Set(orderedPorts)]
}
