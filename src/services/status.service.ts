import { Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'
import { STATUS_VISIBLE_MS } from '../constants'

export interface StatusState {
    message: string
    isError: boolean
    visible: boolean
}

/** Transient status toast shown at the bottom of the sidebar. */
@Injectable({ providedIn: 'root' })
export class StatusService {
    readonly state$ = new BehaviorSubject<StatusState>({ message: '', isError: false, visible: false })
    private timer: any = null

    show (message: string, isError = false): void {
        this.state$.next({ message, isError, visible: true })
        clearTimeout(this.timer)
        this.timer = setTimeout(() => {
            this.state$.next({ ...this.state$.value, visible: false })
        }, STATUS_VISIBLE_MS)
    }
}
