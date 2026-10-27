// Electron's ipcRenderer.invoke() wraps every rejected main-process error as
// `Error invoking remote method 'channel:name': Error: <actual message>` — strip that
// scaffolding so the user sees just the message the code actually threw.
const IPC_PREFIX = /^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/

export function friendlyError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  return message.replace(IPC_PREFIX, '')
}
