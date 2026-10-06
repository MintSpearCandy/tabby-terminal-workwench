import { BaseTerminalTabComponent } from 'tabby-terminal'
import { SESSION_SNAPSHOT_LINES } from './constants'

/**
 * Read-only snapshot of the target terminal session, injected into every
 * {{js:}} evaluation as `session`.  Metadata comes from the tab's profile;
 * output is the plain-text xterm buffer (viewport + scrollback tail) taken
 * at evaluation time, so snippets can parse what the device just printed.
 */
export interface SessionContext {
    /** 'ssh' | 'serial' | 'telnet' | 'local' (from the profile, best effort). */
    type: string
    title: string
    open: boolean
    host?: string
    port?: number
    username?: string
    devicePath?: string
    baudRate?: number
    /** Recent output as one string (trailing empty lines trimmed). */
    output: string
    /** Recent output, one entry per line. */
    lines: string[]
}

export function buildSessionContext (tab: BaseTerminalTabComponent<any> | null): SessionContext {
    const context: SessionContext = {
        type: 'local',
        title: '',
        open: false,
        output: '',
        lines: [],
    }
    if (!tab) {
        return context
    }
    const profile = (tab as unknown as { profile?: { type?: string, options?: Record<string, unknown> } }).profile
    const options = profile?.options ?? {}
    context.type = profile?.type || 'local'
    context.title = tab.title || ''
    context.open = !!tab.session?.open
    if (typeof options.host === 'string') {
        context.host = options.host
    }
    if (typeof options.port === 'number') {
        context.port = options.port
    }
    if (typeof options.user === 'string') {
        context.username = options.user
    } else if (typeof options.username === 'string') {
        context.username = options.username
    }
    if (typeof options.path === 'string') {
        context.devicePath = options.path
    }
    if (typeof options.baudRate === 'number') {
        context.baudRate = options.baudRate
    }
    appendOutputSnapshot(context, tab)
    return context
}

/** Read the xterm buffer tail (plain text, ANSI already resolved). */
function appendOutputSnapshot (context: SessionContext, tab: BaseTerminalTabComponent<any>): void {
    const xterm = (tab.frontend as unknown as {
        xterm?: { buffer?: { active?: { length: number, getLine: (i: number) => { translateToString: (trim: boolean) => string } | undefined } } }
    })?.xterm
    const buffer = xterm?.buffer?.active
    if (!buffer || typeof buffer.length !== 'number') {
        return
    }
    const start = Math.max(0, buffer.length - SESSION_SNAPSHOT_LINES)
    const lines: string[] = []
    for (let i = start; i < buffer.length; i++) {
        lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
    }
    while (lines.length && !lines[0].trim()) {
        lines.shift()
    }
    context.lines = lines
    context.output = lines.join('\n')
}
