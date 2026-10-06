import { Component, OnDestroy } from '@angular/core'
import { StatusService } from '../services/status.service'

@Component({
    selector: 'twx-status-toast',
    template: `
        <div class="twx-status"
             [class.is-visible]="state.visible"
             [class.is-error]="state.isError">{{ state.message }}</div>
    `,
})
export class StatusToastComponent implements OnDestroy {
    state = { message: '', isError: false, visible: false }
    private readonly subscription = this.status.state$.subscribe(state => {
        this.state = state
    })

    constructor (
        private status: StatusService,
    ) { }

    ngOnDestroy (): void {
        this.subscription.unsubscribe()
    }
}
