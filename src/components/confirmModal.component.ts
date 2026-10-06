import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output } from '@angular/core'

/** Generic / dangerous-action confirmation dialog (replaces window.confirm). */
@Component({
    selector: 'twx-confirm-modal',
    template: `
        <div class="twx-modal-backdrop" (pointerdown)="backdrop($event)">
            <div class="twx-modal twx-modal--confirm" role="alertdialog" aria-modal="true">
                <header class="twx-modal-header">
                    <strong>{{ title }}</strong>
                    <button type="button" class="twx-btn twx-icon-btn" title="取消" (click)="finish(false)">×</button>
                </header>
                <div class="twx-modal-body">
                    <p class="twx-modal-message">{{ message }}</p>
                    <div class="twx-actions">
                        <button type="button" class="twx-btn" (click)="finish(false)">取消</button>
                        <button type="button"
                                class="twx-btn"
                                [class.is-primary]="!danger"
                                [class.is-danger]="danger"
                                (click)="finish(true)"
                                #confirmButton>{{ confirmLabel }}</button>
                    </div>
                </div>
            </div>
        </div>
    `,
})
export class ConfirmModalComponent implements AfterViewInit {
    @Input() title = '确认'
    @Input() message = ''
    @Input() confirmLabel = '确认'
    @Input() danger = false
    @Output() done = new EventEmitter<boolean>()

    constructor (
        private host: ElementRef<HTMLElement>,
    ) { }

    ngAfterViewInit (): void {
        this.host.nativeElement.querySelector<HTMLButtonElement>('.twx-actions .twx-btn:not(:first-child)')?.focus()
    }

    finish (value: boolean): void {
        this.done.emit(value)
    }

    backdrop (event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.finish(false)
        }
    }
}
