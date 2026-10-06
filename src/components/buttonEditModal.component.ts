import { Component, EventEmitter, Input, Output } from '@angular/core'
import { QuickButton, Snippet } from '../types'
import { ButtonEditorComponent } from '../settings/buttonEditor.component'

/**
 * Modal frame around the settings-page ButtonEditorComponent, so the sidebar's
 * right-click flow runs the exact same edit semantics ({{delay}} forcing,
 * dangerous-send gating) as the settings page.  Hosted on document.body by
 * the SidebarHostService; the caller destroys it on `done`.
 */
@Component({
    selector: 'twx-button-edit-modal',
    template: `
        <div class="twx-modal-backdrop" (pointerdown)="backdrop($event)">
            <div class="twx-modal" role="dialog" aria-modal="true" (keydown.escape)="close()">
                <header class="twx-modal-header">
                    <strong>{{ isNew ? '新增快捷按钮' : '编辑快捷按钮' }}</strong>
                    <button type="button" class="twx-btn twx-icon-btn" title="取消" (click)="close()">×</button>
                </header>
                <div class="twx-modal-body">
                    <twx-button-editor [sceneId]="sceneId" [snippet]="snippet" [button]="button"
                                       [isNew]="isNew" (closed)="close()"></twx-button-editor>
                </div>
            </div>
        </div>
    `,
})
export class ButtonEditModalComponent {
    @Input() sceneId = ''
    @Input() snippet!: Snippet
    @Input() button!: QuickButton
    @Input() isNew = false
    @Output() done = new EventEmitter<void>()

    close (): void {
        this.done.emit()
    }

    backdrop (event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.close()
        }
    }
}
