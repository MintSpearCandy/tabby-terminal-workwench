import { Injectable } from '@angular/core'
import { BaseTerminalTabComponent, TerminalDecorator } from 'tabby-terminal'
import { WorkwenchBootService } from '../services/boot.service'
import { TerminalBridgeService } from '../services/terminalBridge.service'

@Injectable()
export class TerminalWorkwenchTerminalDecorator extends TerminalDecorator {
    constructor (
        private boot: WorkwenchBootService,
        private bridge: TerminalBridgeService,
    ) {
        super()
    }

    attach (tab: BaseTerminalTabComponent<any>): void {
        this.boot.ensure()
        this.bridge.registerTab(tab)
    }

    detach (tab: BaseTerminalTabComponent<any>): void {
        this.bridge.unregisterTab(tab)
        super.detach(tab)
    }
}
