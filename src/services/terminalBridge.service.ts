import { Injectable } from '@angular/core'
import { AppService, SplitTabComponent } from 'tabby-core'
import { BaseTerminalTabComponent, ConnectableTerminalTabComponent } from 'tabby-terminal'
import { BehaviorSubject, Subscription } from 'rxjs'

export interface TargetState {
    /** '' when no active terminal. */
    label: string
    /** Remote/session-based terminal (SSH / Telnet / Serial) — shows a status light. */
    remote: boolean
    /** Light green while `session.open`, red while disconnected. */
    connected: boolean
}

/**
 * Single place that knows about terminal tabs: registration via the terminal
 * decorator, active-terminal resolution, focus/paste interactions, and the
 * active-target state shown in the sidebar header.
 */
@Injectable({ providedIn: 'root' })
export class TerminalBridgeService {
    private terminals: BaseTerminalTabComponent<any>[] = []
    readonly target$ = new BehaviorSubject<TargetState>({ label: '', remote: false, connected: false })
    private targetSubscriptions: Subscription[] = []

    constructor (
        private app: AppService,
    ) {
        this.app.activeTabChange$.subscribe(() => this.refreshTarget())
    }

    registerTab (tab: BaseTerminalTabComponent<any>): void {
        if (!this.terminals.includes(tab)) {
            this.terminals.push(tab)
        }
        this.refreshTarget()
    }

    unregisterTab (tab: BaseTerminalTabComponent<any>): void {
        this.terminals = this.terminals.filter(candidate => candidate !== tab)
        this.refreshTarget()
    }

    findActiveTerminal (): BaseTerminalTabComponent<any> | null {
        const active = this.app.activeTab
        if (active instanceof BaseTerminalTabComponent) {
            return active
        }
        if (active instanceof SplitTabComponent) {
            const focused = active.getFocusedTab()
            if (focused instanceof BaseTerminalTabComponent) {
                return focused
            }
            const firstTerminal = active.getAllTabs().find(tab => tab instanceof BaseTerminalTabComponent)
            if (firstTerminal instanceof BaseTerminalTabComponent) {
                return firstTerminal
            }
        }
        return this.terminals.find(tab => tab.hasFocus)
            || this.terminals.find(tab => !!tab.session)
            || null
    }

    focusActiveTerminal (): void {
        this.findActiveTerminal()?.frontend?.focus()
    }

    /** The DOM element a synthetic paste event should be dispatched on. */
    findPasteTarget (terminal: BaseTerminalTabComponent<any>): HTMLElement | null {
        const root = terminal.element?.nativeElement as HTMLElement | undefined
        return root?.querySelector<HTMLElement>('.xterm-helper-textarea')
            || root?.querySelector<HTMLElement>('textarea')
            || document.activeElement as HTMLElement | null
    }

    /**
     * Paste multi-line text into the terminal as a single bracketed-paste
     * event instead of sending line by line.  Returns false when the
     * environment cannot build/dispatch the event, callers then fall back to
     * sendInput.
     */
    async pasteText (terminal: BaseTerminalTabComponent<any>, text: string): Promise<boolean> {
        terminal.frontend?.focus()
        await new Promise(resolve => setTimeout(resolve, 0))
        const target = this.findPasteTarget(terminal)
        if (!target) {
            return false
        }
        let data: DataTransfer | null = null
        try {
            data = new DataTransfer()
            data.setData('text/plain', text)
        } catch {
            return false
        }
        try {
            const event = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: data,
            } as ClipboardEventInit)
            target.dispatchEvent(event)
            return true
        } catch {
            return false
        }
    }

    private refreshTarget (): void {
        for (const subscription of this.targetSubscriptions) {
            subscription.unsubscribe()
        }
        this.targetSubscriptions = []

        const emit = (): void => {
            const terminal = this.findActiveTerminal()
            this.target$.next({
                label: terminal ? `目标：${terminal.title || '当前终端'}` : '',
                remote: !!terminal && terminal instanceof ConnectableTerminalTabComponent,
                connected: !!terminal?.session?.open,
            })
        }
        emit()

        const terminal = this.findActiveTerminal()
        if (!terminal) {
            return
        }
        // Reconnects swap sessions; closes flip `session.open` — both need a
        // light refresh while this tab stays the active target.
        this.targetSubscriptions.push(terminal.sessionChanged$.subscribe(() => emit()))
        if (terminal.session) {
            this.targetSubscriptions.push(terminal.session.closed$.subscribe(() => emit()))
            this.targetSubscriptions.push(terminal.session.destroyed$.subscribe(() => emit()))
        }
    }
}
