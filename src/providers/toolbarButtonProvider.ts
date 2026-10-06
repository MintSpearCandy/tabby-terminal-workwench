import { Injectable } from '@angular/core'
import { ToolbarButton, ToolbarButtonProvider } from 'tabby-core'
import { SIDEBAR_ICON } from '../icons'
import { WorkwenchBootService } from '../services/boot.service'

@Injectable()
export class TerminalWorkwenchToolbarButtonProvider extends ToolbarButtonProvider {
    constructor (
        private boot: WorkwenchBootService,
    ) {
        super()
        // Toolbar providers are instantiated at app start; use that as the
        // earliest reliable hook to prepare the sidebar.
        this.boot.ensure()
    }

    provide (): ToolbarButton[] {
        return [
            {
                icon: SIDEBAR_ICON,
                title: 'Terminal Workwench',
                weight: 30,
                click: () => this.boot.toggleSidebar(),
            },
        ]
    }
}
