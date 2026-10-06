import { Injectable } from '@angular/core'
import { filter, take } from 'rxjs'
import { SidebarRootComponent } from '../components/sidebarRoot.component'
import { DockLayoutService } from './dockLayout.service'
import { SidebarHostService } from './sidebarHost.service'
import { WorkwenchStore } from './store.service'
import { TerminalBridgeService } from './terminalBridge.service'

/**
 * Startup orchestration: once the store has loaded (and possibly performed
 * the one-time workbench import), mount the sidebar component and keep the
 * dock layout in sync with the model.  `ensure()` is idempotent and is
 * called from the toolbar provider (app start) and the terminal decorator
 * (first terminal attach) as a fallback.
 */
@Injectable({ providedIn: 'root' })
export class WorkwenchBootService {
    private booted = false

    constructor (
        private store: WorkwenchStore,
        private host: SidebarHostService,
        private dock: DockLayoutService,
        private bridge: TerminalBridgeService,
    ) { }

    ensure (): void {
        if (this.booted) {
            return
        }
        this.booted = true
        this.store.ready$
            .pipe(filter(ready => ready), take(1))
            .subscribe(() => {
                this.host.mountSidebar(SidebarRootComponent)
                this.store.config$.subscribe(model => this.dock.applyState(model))
            })
    }

    toggleSidebar (): void {
        this.ensure()
        const open = !this.store.snapshot.open
        this.store.setOpen(open)
        if (!open) {
            queueMicrotask(() => this.bridge.focusActiveTerminal())
        }
    }
}
