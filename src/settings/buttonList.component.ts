import { Component, Input, OnDestroy } from '@angular/core'

import { PlatformService } from 'tabby-core'
import { hasDangerousCommand } from '../commandSequence'
import { resolveSceneButtons } from '../model'
import { QuickButton, ResolvedButton, Snippet } from '../types'
import { ButtonEditModalComponent } from '../components/buttonEditModal.component'
import { SidebarHostService } from '../services/sidebarHost.service'
import { WorkwenchStore } from '../services/store.service'

/**
 * Indented button rows under one scene in the settings-page tree
 * (profiles-page item style: action badge, name, muted preview,
 * hover-reveal edit/delete).  Rows reorder by vertical drag only (the
 * shared SortableDirective); clicking a row opens the shared edit modal.
 * Creation is centralized in the parent's toolbar (filter + 新建 menu).
 */
@Component({
    selector: 'twx-button-list',
    template: `
        <div class="ps-4"
             [appSortable]="'vertical'"
             appSortableItem=".twx-item"
             (appSortableCommit)="onReorder($event)">
            <div *ngFor="let item of visible; trackBy: trackById"
                 class="twx-collapse-item twx-item d-flex align-items-center p-1"
                 [attr.data-sortable-id]="item.binding.id"
                 (click)="edit(item)">
                <span class="badge" [ngClass]="badgeClass(item)">{{ badge(item) }}</span>
                <span class="ms-3 no-wrap">{{ item.snippet.name || '未命名按钮' }}</span>
                <span class="text-muted no-wrap ms-2 twx-item-preview" [title]="item.snippet.text">{{ preview(item) }}</span>
                <div class="me-auto"></div>
                <button type="button" class="btn btn-sm btn-link hover-reveal ms-1"
                        title="编辑"
                        (click)="edit(item); $event.stopPropagation()">
                    <i class="fas fa-fw fa-pencil-alt"></i>
                </button>
                <button type="button" class="btn btn-sm btn-link hover-reveal ms-1 text-danger"
                        title="删除"
                        (click)="remove(item); $event.stopPropagation()">
                    <i class="fas fa-fw fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `,
})
export class ButtonListComponent implements OnDestroy {
    private sceneIdValue = ''
    resolved: ResolvedButton[] = []
    /** Toolbar filter query (matched against snippet name and text). */
    @Input() filter = ''
    /** Scene name matched the filter → show every row unfiltered. */
    @Input() showAll = true
    private readonly subscription = this.store.config$.subscribe(() => this.refresh())

    /** Setting the scene from the parent must refresh too—config$ does not
     * re-emit on Input changes alone. */
    @Input()
    set sceneId (value: string) {
        this.sceneIdValue = value
        this.refresh()
    }

    get sceneId (): string {
        return this.sceneIdValue
    }

    get visible (): ResolvedButton[] {
        const q = this.filter.trim().toLowerCase()
        if (this.showAll || !q) {
            return this.resolved
        }
        return this.resolved.filter(item =>
            item.snippet.name.toLowerCase().includes(q) || item.snippet.text.toLowerCase().includes(q))
    }

    private refresh (): void {
        const scene = this.store.snapshot.scenes.find(candidate => candidate.id === this.sceneIdValue)
        this.resolved = scene ? resolveSceneButtons(scene) : []
    }

    constructor (
        private store: WorkwenchStore,
        private platform: PlatformService,
        private host: SidebarHostService,
    ) { }

    edit (item: ResolvedButton): void {
        this.openEditor(item.snippet, item.binding, false)
    }

    /** Drag-sort commit: the store rejects subset orders (filter active). */
    onReorder (orderedIds: string[]): void {
        this.store.reorderButtons(this.sceneId, orderedIds)
    }

    async remove (item: ResolvedButton): Promise<void> {
        const result = await this.platform.showMessageBox({
            type: 'warning',
            buttons: ['删除', '保留'],
            defaultId: 1,
            cancelId: 1,
            message: `确定删除快捷按钮「${item.snippet.name || '未命名按钮'}」？此操作不可撤销。`,
        })
        if (result.response !== 0) {
            return
        }
        this.store.removeButton(this.sceneId, item.binding.id)
    }

    isSend (item: ResolvedButton): boolean {
        return item.binding.action === 'fill' && item.binding.appendCR
    }

    isDangerous (item: ResolvedButton): boolean {
        return this.isSend(item) && hasDangerousCommand(item.snippet.text)
    }

    badge (item: ResolvedButton): string {
        if (item.binding.action === 'copy') {
            return '复制'
        }
        if (this.isDangerous(item)) {
            return '发送·高危'
        }
        return this.isSend(item) ? '发送' : '填充'
    }

    /** Bootstrap badge variants, like the profiles page's type badges. */
    badgeClass (item: ResolvedButton): string {
        if (this.isDangerous(item)) {
            return 'text-bg-danger'
        }
        if (item.binding.action === 'copy') {
            return 'text-bg-info'
        }
        return this.isSend(item) ? 'text-bg-warning' : 'text-bg-secondary'
    }

    preview (item: ResolvedButton): string {
        return item.snippet.text.split(/\r?\n/)[0] || '（空）'
    }

    trackById (_index: number, item: ResolvedButton): string {
        return item.binding.id
    }

    ngOnDestroy (): void {
        this.subscription.unsubscribe()
    }

    private openEditor (snippet: Snippet, button: QuickButton, isNew: boolean): void {
        const ref = this.host.openModal(ButtonEditModalComponent, {
            sceneId: this.sceneId,
            snippet,
            button,
            isNew,
        })
        let settled = false
        const subscription = ref.instance.done.subscribe(() => {
            if (settled) {
                return
            }
            settled = true
            subscription.unsubscribe()
            this.host.closeModal(ref)
        })
    }
}
