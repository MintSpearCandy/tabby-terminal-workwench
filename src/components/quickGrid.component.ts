import { Component, OnDestroy } from '@angular/core'
import { hasDangerousCommand } from '../commandSequence'
import { createId, findActiveScene, resolveSceneButtons } from '../model'
import { QuickButton, ResolvedButton, Snippet } from '../types'
import { ButtonEditModalComponent } from './buttonEditModal.component'
import { ConfirmModalComponent } from './confirmModal.component'
import { ContextMenuService } from '../services/contextMenu.service'
import { ExecutorService } from '../services/executor.service'
import { SidebarHostService } from '../services/sidebarHost.service'
import { WorkwenchStore } from '../services/store.service'

/**
 * Execution surface with right-click management: click a button to run it,
 * drag to reorder; the button context menu offers edit / copy / delete, the
 * section context menu adds a new button.  Cards render snippet content
 * (name / colour / text) joined with the quick-button binding semantics.
 */
@Component({
    selector: 'twx-quick-grid',
    template: `
        <section class="twx-section--quick" (contextmenu)="onSectionMenu($event)">
            <div class="twx-section-header">
                <div class="twx-section-title">
                    <strong>快捷按钮</strong>
                    <span>{{ resolved.length }}</span>
                    <small>拖动排序 · 右键管理</small>
                </div>
            </div>
            <div class="twx-quick-grid"
                 *ngIf="resolved.length; else empty"
                 [appSortable]="'grid'"
                 appSortableItem=".twx-quick-card"
                 (appSortableCommit)="onReorder($event)">
                <article *ngFor="let item of resolved; trackBy: trackById"
                         class="twx-quick-card"
                         [attr.data-sortable-id]="item.binding.id"
                         [class.is-send]="isSend(item)"
                         [class.is-dangerous]="isDangerous(item)"
                         [style.--item-color]="item.snippet.color"
                         [title]="cardTitle(item)"
                         (contextmenu)="onCardMenu($event, item)">
                    <span class="twx-quick-badge"
                          [class.is-send]="isSend(item)"
                          [class.is-copy]="item.binding.action === 'copy'"
                          [class.is-dangerous]="isDangerous(item)">{{ modeLabel(item) }}</span>
                    <button type="button" class="twx-quick-execute" (click)="execute(item)">
                        <span class="twx-quick-label">{{ item.snippet.name }}</span>
                    </button>
                </article>
            </div>
            <ng-template #empty>
                <div class="twx-quick-empty">
                    当前场景还没有快捷按钮<br />右键此处新增，或到 设置 → Terminal Workwench 管理
                </div>
            </ng-template>
        </section>
    `,
})
export class QuickGridComponent implements OnDestroy {
    resolved: ResolvedButton[] = []
    private sceneId = ''
    private readonly subscription = this.store.config$.subscribe(config => {
        const scene = findActiveScene(config)
        this.sceneId = scene.id
        this.resolved = resolveSceneButtons(scene)
    })

    constructor (
        private store: WorkwenchStore,
        private executor: ExecutorService,
        private menu: ContextMenuService,
        private host: SidebarHostService,
    ) { }

    execute (item: ResolvedButton): void {
        void this.executor.execute(this.sceneId, item)
    }

    onReorder (orderedIds: string[]): void {
        this.store.reorderButtons(this.sceneId, orderedIds)
    }

    onCardMenu (event: MouseEvent, item: ResolvedButton): void {
        this.menu.open(event, [
            { label: '编辑', action: () => this.openEditor(item.snippet, item.binding, false) },
            {
                label: '复制内容',
                action: () => void this.executor.execute(this.sceneId, {
                    binding: { ...item.binding, action: 'copy' },
                    snippet: item.snippet,
                }),
            },
            { label: '删除', danger: true, action: () => void this.confirmDelete(item) },
        ])
    }

    onSectionMenu (event: MouseEvent): void {
        const draft = this.newButtonPair()
        this.menu.open(event, [
            { label: '新增按钮', action: () => this.openEditor(draft.snippet, draft.binding, true) },
        ])
    }

    isSend (item: ResolvedButton): boolean {
        return item.binding.action === 'fill' && item.binding.appendCR
    }

    isDangerous (item: ResolvedButton): boolean {
        return this.isSend(item) && hasDangerousCommand(item.snippet.text)
    }

    modeLabel (item: ResolvedButton): string {
        if (item.binding.action === 'copy') {
            return '复制'
        }
        return this.isSend(item) ? '发送' : '填充'
    }

    cardTitle (item: ResolvedButton): string {
        const action = item.binding.action === 'copy' ? '复制' : this.isSend(item) ? '发送并回车' : '填充到当前终端'
        return `${item.snippet.text}\n点击${action}，拖动调整顺序，右键管理`
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

    /** A fresh snippet plus a quick-button binding that references it. */
    private newButtonPair (): { snippet: Snippet, binding: QuickButton } {
        const snippet: Snippet = { id: createId('snip'), name: '', text: '', color: '#22c55e' }
        return {
            snippet,
            binding: {
                type: 'quick-button',
                id: createId('btn'),
                snippetId: snippet.id,
                action: 'fill',
                appendCR: false,
                dangerAccepted: false,
            },
        }
    }

    private async confirmDelete (item: ResolvedButton): Promise<void> {
        const confirmed = await new Promise<boolean>(resolve => {
            const ref = this.host.openModal(ConfirmModalComponent, {
                title: '删除快捷按钮',
                message: `确定删除快捷按钮「${item.snippet.name || '未命名片段'}」？此操作不可撤销。`,
                confirmLabel: '删除',
                danger: true,
            })
            let settled = false
            const finish = (value: boolean): void => {
                if (settled) {
                    return
                }
                settled = true
                subscription.unsubscribe()
                this.host.closeModal(ref)
                resolve(value)
            }
            const subscription = ref.instance.done.subscribe(value => finish(value))
        })
        if (confirmed) {
            this.store.removeButton(this.sceneId, item.binding.id)
        }
    }
}
