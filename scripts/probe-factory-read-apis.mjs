import { listComputers, listMachineTemplates, listRemoteSessions } from '@factory/droid-sdk'

const apiKey =
  process.env.FACTORY_API_KEY ?? process.env.DROID_API_KEY ?? process.env.DAEMON_API_KEY

if (!apiKey) {
  throw new Error(
    'Set FACTORY_API_KEY, DROID_API_KEY, or DAEMON_API_KEY before running this probe.',
  )
}

const summarizeTemplate = (template) => ({
  templateId: template.templateId,
  templateName: template.templateName,
  repoUrl: template.repoUrl,
  defaultBranch: template.defaultBranch,
  buildStatus: template.buildStatus?.status ?? null,
})

const summarizeComputer = (computer) => ({
  id: computer.id,
  name: computer.name,
  hostname: computer.hostname ?? null,
  providerType: computer.providerType,
  status: computer.status ?? null,
  remoteUser: computer.remoteUser ?? null,
})

const summarizeRemoteSession = (session) => ({
  sessionId: session.sessionId,
  title: session.title ?? null,
  status: session.status,
  messageCount: session.messageCount,
  computerId: session.computerId ?? null,
})

const [templates, computers, remoteSessions] = await Promise.all([
  listMachineTemplates({ apiKey, limit: 10 }),
  listComputers({ apiKey }),
  listRemoteSessions({ apiKey, limit: 10 }),
])

console.log(
  JSON.stringify(
    {
      templates: {
        count: templates.templates.length,
        hasMore: templates.pagination.hasMore,
        nextCursor: templates.pagination.nextCursor,
        items: templates.templates.map(summarizeTemplate),
      },
      computers: {
        count: computers.computers.length,
        items: computers.computers.map(summarizeComputer),
      },
      remoteSessions: {
        count: remoteSessions.sessions.length,
        hasMore: remoteSessions.pagination.hasMore,
        nextCursor: remoteSessions.pagination.nextCursor,
        items: remoteSessions.sessions.map(summarizeRemoteSession),
      },
    },
    null,
    2,
  ),
)
