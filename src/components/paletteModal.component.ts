import { AfterViewInit, Component, ElementRef, EventEmitter, Output } from '@angular/core'
import { visibleScenes } from '../model'
import { QuickButton, Scene, Snippet } from '../types'
import { ExecutorService } from '../services/executor.service'
import { WorkwenchStore } from '../services/store.service'

/** One searchable snippet: its owning scene plus the invocation to run. */
interface PaletteEntry {
    sceneId: string
    sceneName: string
    sceneColor: string
    sceneIcon: string
    snippet: Snippet
    binding: QuickButton
}

/** Render row: a scene header (grouped mode) or a snippet entry. */
type PaletteRow =
    | { kind: 'header', sceneId: string, sceneName: string, sceneColor: string, sceneIcon: string, count: number }
    | { kind: 'item', entry: PaletteEntry, itemIndex: number }

/**
 * Quick-search palette over every snippet in every visible scene — the first
 * invoker beyond quick buttons.  Type to filter (name / content / scene),
 * ↑↓ to select (scene headers are skipped), Enter (or click) to run through
 * the ExecutorService with the snippet's own binding semantics when bound,
 * plain fill otherwise.  With the `paletteGrouped` setting on, results render
 * as a settings-page-like tree (scene header rows, indented snippet rows);
 * otherwise as a flat list.  Hosted on document.body by the
 * SidebarHostService; the caller destroys it on `done`.
 */
@Component({
    selector: 'twx-palette-modal',
    template: `
        <div class="twx-modal-backdrop" (pointerdown)="backdrop($event)">
            <div class="twx-modal twx-palette" role="dialog" aria-modal="true">
                <div class="twx-palette-input-wrap">
                    <i class="fas fa-search"></i>
                    <input type="search"
                           [(ngModel)]="query"
                           (ngModelChange)="onQueryChange()"
                           (keydown)="onKeydown($event)"
                           placeholder="搜索片段：名称 / 内容 / 场景"
                           spellcheck="false"
                           autocomplete="off" />
                </div>
                <div class="twx-palette-list">
                    <ng-container *ngFor="let row of rows; trackBy: trackRow">
                        <div *ngIf="row.kind === 'header'; else itemRow" class="twx-palette-group">
                            <i class="fa fa-fw twx-scene-icon"
                               [ngClass]="row.sceneIcon || 'far fa-folder'"
                               [style.color]="row.sceneColor"></i>
                            <span class="twx-palette-group-name">{{ row.sceneName }}</span>
                            <span class="twx-palette-group-count">{{ row.count }}</span>
                        </div>
                        <ng-template #itemRow>
                            <div class="twx-palette-item"
                                 [class.is-grouped]="grouped"
                                 [class.is-selected]="row.itemIndex === selectedIndex"
                                 (click)="trigger(row.entry)"
                                 (mouseenter)="selectedIndex = row.itemIndex">
                                <span class="twx-palette-mode">{{ mode(row.entry) }}</span>
                                <span class="twx-palette-name">{{ row.entry.snippet.name }}</span>
                                <span *ngIf="!grouped" class="twx-palette-scene">{{ row.entry.sceneName }}</span>
                                <span class="twx-palette-preview">{{ preview(row.entry) }}</span>
                            </div>
                        </ng-template>
                    </ng-container>
                    <div *ngIf="!rows.length" class="twx-palette-empty">没有匹配的片段</div>
                </div>
                <footer class="twx-palette-hint">↑↓ 选择 · Enter 执行 · Esc 关闭</footer>
            </div>
        </div>
    `,
})
export class PaletteModalComponent implements AfterViewInit {
    @Output() done = new EventEmitter<void>()

    query = ''
    rows: PaletteRow[] = []
    selectedIndex = 0
    /** Flat filtered entries — the keyboard-selection sequence. */
    private filtered: PaletteEntry[] = []
    private readonly entries: PaletteEntry[]
    readonly grouped: boolean

    constructor (
        private store: WorkwenchStore,
        private executor: ExecutorService,
        private host: ElementRef<HTMLElement>,
    ) {
        this.grouped = store.snapshot.paletteGrouped
        this.entries = this.collectEntries()
        this.applyFilter()
    }

    ngAfterViewInit (): void {
        const input = this.host.nativeElement.querySelector<HTMLInputElement>('input')
        input?.focus()
        input?.select()
    }

    onQueryChange (): void {
        this.selectedIndex = 0
        this.applyFilter()
    }

    onKeydown (event: KeyboardEvent): void {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            this.move(1)
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            this.move(-1)
        } else if (event.key === 'Enter') {
            event.preventDefault()
            const entry = this.filtered[this.selectedIndex]
            if (entry) {
                this.trigger(entry)
            }
        } else if (event.key === 'Escape') {
            event.preventDefault()
            this.close()
        }
    }

    move (delta: number): void {
        if (!this.filtered.length) {
            return
        }
        this.selectedIndex = (this.selectedIndex + delta + this.filtered.length) % this.filtered.length
        this.scrollSelectedIntoView()
    }

    trigger (entry: PaletteEntry): void {
        void this.executor.execute(entry.sceneId, {
            binding: entry.binding,
            snippet: entry.snippet,
        })
        this.close()
    }

    close (): void {
        this.done.emit()
    }

    backdrop (event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.close()
        }
    }

    mode (entry: PaletteEntry): string {
        if (entry.binding.action === 'copy') {
            return '复制'
        }
        return entry.binding.appendCR ? '发送' : '填充'
    }

    preview (entry: PaletteEntry): string {
        return entry.snippet.text.split(/\r?\n/)[0] || '（空）'
    }

    trackRow (_index: number, row: PaletteRow): string {
        return row.kind === 'header' ? `header-${row.sceneId}` : row.entry.snippet.id
    }

    private collectEntries (): PaletteEntry[] {
        const entries: PaletteEntry[] = []
        for (const scene of visibleScenes(this.store.snapshot)) {
            for (const snippet of scene.snippets) {
                // Reuse the snippet's own binding semantics when bound (action,
                // auto-CR, danger state); plain fill for library-only snippets.
                const binding = scene.buttons.find(button => button.snippetId === snippet.id)
                    ?? {
                        type: 'quick-button' as const,
                        id: `palette-${snippet.id}`,
                        snippetId: snippet.id,
                        action: 'fill' as const,
                        appendCR: false,
                        dangerAccepted: false,
                    }
                entries.push({
                    sceneId: scene.id,
                    sceneName: scene.name,
                    sceneColor: scene.color,
                    sceneIcon: scene.icon,
                    snippet,
                    binding,
                })
            }
        }
        return entries
    }

    private applyFilter (): void {
        const q = this.query.trim().toLowerCase()
        this.filtered = q
            ? this.entries.filter(entry =>
                entry.snippet.name.toLowerCase().includes(q)
                || entry.snippet.text.toLowerCase().includes(q)
                || entry.sceneName.toLowerCase().includes(q))
            : [...this.entries]
        this.rows = this.grouped ? this.buildGroupedRows() : this.buildFlatRows()
    }

    private buildFlatRows (): PaletteRow[] {
        return this.filtered.map((entry, itemIndex) => ({ kind: 'item', entry, itemIndex }))
    }

    /** Settings-page-like tree: one header per scene (entries are
     *  scene-ordered, so groups are contiguous), snippets indented below.
     *  Two passes — the header needs the final count, which is only known
     *  after its entries are collected. */
    private buildGroupedRows (): PaletteRow[] {
        const groups: Array<{ entry: PaletteEntry, itemIndex: number }[]> = []
        for (const [itemIndex, entry] of this.filtered.entries()) {
            const last = groups[groups.length - 1]
            if (last && last[0]?.entry.sceneId === entry.sceneId) {
                last.push({ entry, itemIndex })
            } else {
                groups.push([{ entry, itemIndex }])
            }
        }
        const rows: PaletteRow[] = []
        for (const group of groups) {
            const { sceneId, sceneName, sceneColor, sceneIcon } = group[0].entry
            rows.push({ kind: 'header', sceneId, sceneName, sceneColor, sceneIcon, count: group.length })
            for (const { entry, itemIndex } of group) {
                rows.push({ kind: 'item', entry, itemIndex })
            }
        }
        return rows
    }

    private scrollSelectedIntoView (): void {
        setTimeout(() => {
            this.host.nativeElement
                .querySelector('.twx-palette-item.is-selected')
                ?.scrollIntoView({ block: 'nearest' })
        })
    }
}
