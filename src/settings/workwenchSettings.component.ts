import { Component, OnDestroy } from '@angular/core'
import { PlatformService } from 'tabby-core'
import { createId, findActiveScene, visibleScenes } from '../model'
import { UNGROUPED_SCENE_ID } from '../constants'
import { QuickButton, Scene, Snippet } from '../types'
import { ButtonEditModalComponent } from '../components/buttonEditModal.component'
import { SceneEditModalComponent } from './sceneEditModal.component'
import { ContextMenuService } from '../services/contextMenu.service'
import { SidebarHostService } from '../services/sidebarHost.service'
import { WorkwenchStore } from '../services/store.service'

/** Filtered view entry: a scene plus whether all its rows show. */
interface SceneEntry {
    scene: Scene
    showAll: boolean
}

/**
 * Settings page with two tabs: snippet management (default — the toolbar +
 * collapse-container tree, profiles-page style) and panel settings (toggles,
 * glass and sidebar-mask tunables).
 */
@Component({
    selector: 'twx-settings',
    template: `
        <div class="twx-settings">
            <div class="twx-settings-tabs" role="tablist">
                <button type="button" role="tab"
                        class="twx-settings-tab" [class.is-active]="tab === 'snippets'"
                        (click)="tab = 'snippets'">片段管理</button>
                <button type="button" role="tab"
                        class="twx-settings-tab" [class.is-active]="tab === 'panel'"
                        (click)="tab = 'panel'">面板设置</button>
            </div>

            <ng-container *ngIf="tab === 'snippets'">
                <div class="d-flex mb-3">
                    <div class="input-group">
                        <span class="input-group-text"><i class="fas fa-search"></i></span>
                        <input type="search" class="form-control" placeholder="筛选场景与快捷按钮"
                               [(ngModel)]="filter" (ngModelChange)="rebuildView()" />
                    </div>
                    <div class="d-inline-block flex-shrink-0 ms-3">
                        <button type="button" class="btn btn-primary" (click)="openCreateMenu($event)">
                            <i class="fas fa-plus"></i> 新建
                        </button>
                    </div>
                </div>

                <div class="d-flex flex-column p-2 twx-collapse-container">
                    <ng-container *ngFor="let entry of view; let i = index">
                        <div class="twx-collapse-item d-flex align-items-center p-1"
                             (click)="toggleCollapse(entry.scene.id)">
                            <i class="fa fa-fw twx-scene-icon"
                               [ngClass]="entry.scene.icon || (isExpanded(entry.scene.id) ? 'far fa-folder-open' : 'far fa-folder')"
                               [style.color]="entry.scene.color"></i>
                            <span class="ms-2 no-wrap">{{ entry.scene.name }}</span>
                            <span class="text-muted no-wrap ms-2">{{ entry.scene.buttons.length }} 个按钮</span>
                            <span *ngIf="entry.scene.id === activeSceneId" class="badge text-bg-success ms-2">使用中</span>
                            <div class="me-auto"></div>
                            <button type="button" class="btn btn-sm btn-link ms-2"
                                    [disabled]="i === 0" title="上移"
                                    (click)="moveScene(entry.scene.id, -1); $event.stopPropagation()">
                                <i class="fas fa-fw fa-arrow-up"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-link ms-2"
                                    [disabled]="i === view.length - 1" title="下移"
                                    (click)="moveScene(entry.scene.id, 1); $event.stopPropagation()">
                                <i class="fas fa-fw fa-arrow-down"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-link hover-reveal ms-2"
                                    title="编辑场景"
                                    (click)="editScene(entry.scene); $event.stopPropagation()">
                                <i class="fas fa-fw fa-pencil-alt"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-link hover-reveal ms-2 text-danger"
                                    [disabled]="scenes.length <= 1" title="删除场景"
                                    (click)="removeScene(entry.scene); $event.stopPropagation()">
                                <i class="fas fa-fw fa-trash-alt"></i>
                            </button>
                        </div>
                        <twx-button-list *ngIf="isExpanded(entry.scene.id)"
                                         [sceneId]="entry.scene.id"
                                         [filter]="filter" [showAll]="entry.showAll"></twx-button-list>
                    </ng-container>
                    <div *ngIf="!view.length" class="text-muted p-2">没有匹配的场景或快捷按钮</div>
                </div>
                <p class="hint">点击场景行折叠/展开其快捷按钮；点击快捷按钮行编辑。场景行右侧按钮调整分组顺序；快捷按钮行上下拖动排序；悬停行可编辑、删除。新建快捷按钮会加入「使用中」的场景；场景与按钮同样可以在侧栏中右键管理；至少保留一个场景。</p>
            </ng-container>

            <ng-container *ngIf="tab === 'panel'">
                <div class="form-line">
                    <div class="header">
                        <div class="title">启用侧边命令面板</div>
                        <div class="description">关闭后隐藏右侧面板并取消停靠布局</div>
                    </div>
                    <toggle [ngModel]="enabled" (ngModelChange)="setEnabled($event)"></toggle>
                </div>
                <div class="form-line mb-3">
                    <div class="header">
                        <div class="title">启动时默认展开面板</div>
                        <div class="description">只决定下次启动 Tabby 时面板是否展开；当前会话请用工具栏按钮随时开关，不会写入配置。面板宽度可在侧栏左缘拖动调整。</div>
                    </div>
                    <toggle [ngModel]="openDefault" (ngModelChange)="setOpenDefault($event)"></toggle>
                </div>

                <div class="form-line">
                    <div class="header">
                        <div class="title">快捷按钮毛玻璃</div>
                        <div class="description">开启后按钮卡片对背后内容做毛玻璃式模糊（模糊半径在下方调整）。</div>
                    </div>
                    <toggle [ngModel]="glassBlurEnabled" (ngModelChange)="setGlass('glassBlurEnabled', $event)"></toggle>
                </div>
                <div class="form-line" *ngIf="glassBlurEnabled">
                    <div class="header">
                        <div class="title">毛玻璃 · 模糊度</div>
                        <div class="description">按钮背后内容的模糊半径，0–40 像素。</div>
                    </div>
                    <input type="number" class="form-control" min="0" max="40" step="1"
                           [ngModel]="glassBlur" (ngModelChange)="setGlass('glassBlur', $event)" />
                </div>
                <div class="form-line">
                    <div class="header">
                        <div class="title">快捷按钮 · 颜色浓度</div>
                        <div class="description">按钮背景中片段颜色的占比，0–1（0 为近纯玻璃）。</div>
                    </div>
                    <input type="number" class="form-control" min="0" max="1" step="0.05"
                           [ngModel]="glassOpacity" (ngModelChange)="setGlass('glassOpacity', $event)" />
                </div>
                <div class="form-line mb-3">
                    <div class="header">
                        <div class="title">快捷按钮 · 亮度</div>
                        <div class="description">按钮背后内容的亮度系数，0.2–2（1 为不调整）。</div>
                    </div>
                    <input type="number" class="form-control" min="0.2" max="2" step="0.05"
                           [ngModel]="glassBrightness" (ngModelChange)="setGlass('glassBrightness', $event)" />
                </div>

                <div class="form-line">
                    <div class="header">
                        <div class="title">侧边栏背景透明遮罩</div>
                        <div class="description">开启后侧栏以半透明底色显示（终端窗格仍被挤开、不被覆盖）；透明度与底色在下方调整，改动即时生效。</div>
                    </div>
                    <toggle [ngModel]="sidebarTransparent" (ngModelChange)="setSidebarStyle('sidebarTransparent', $event)"></toggle>
                </div>
                <div class="form-line" *ngIf="sidebarTransparent">
                    <div class="header">
                        <div class="title">侧边栏 · 背景透明度</div>
                        <div class="description">底色的不透明度，0–1（0 近乎全透明，透出窗体背景）。</div>
                    </div>
                    <input type="number" class="form-control" min="0" max="1" step="0.05"
                           [ngModel]="sidebarOpacity" (ngModelChange)="setSidebarStyle('sidebarOpacity', $event)" />
                </div>
                <div class="form-line mb-3" *ngIf="sidebarTransparent">
                    <div class="header">
                        <div class="title">侧边栏 · 底色</div>
                        <div class="description">遮罩的基础颜色。</div>
                    </div>
                    <twx-color-swatches [color]="sidebarColor" (colorChange)="setSidebarStyle('sidebarColor', $event)"></twx-color-swatches>
                </div>

                <div class="form-line">
                    <div class="header">
                        <div class="title">搜索面板按分组显示</div>
                        <div class="description">开启后，快捷搜索的结果按场景分组层级显示（带场景头行，与设置页列表一致）；关闭时为平铺列表。</div>
                    </div>
                    <toggle [ngModel]="paletteGrouped" (ngModelChange)="setPaletteGrouped($event)"></toggle>
                </div>
            </ng-container>
        </div>
    `,
})
export class WorkwenchSettingsComponent implements OnDestroy {
    tab: 'snippets' | 'panel' = 'snippets'
    enabled = false
    openDefault = false
    paletteGrouped = false
    glassBlurEnabled = false
    glassOpacity = 0.15
    glassBlur = 8
    glassBrightness = 1
    sidebarTransparent = true
    sidebarOpacity = 0.03
    sidebarColor = '#808080'
    scenes: Scene[] = []
    view: SceneEntry[] = []
    activeSceneId = ''
    filter = ''
    private readonly subscription = this.store.config$.subscribe(config => {
        // Visible scenes only — the virtual 无组别 group hides while empty.
        this.scenes = visibleScenes(config)
        this.activeSceneId = findActiveScene(config).id
        this.enabled = config.enabled
        this.openDefault = config.openDefault
        this.paletteGrouped = config.paletteGrouped
        this.glassBlurEnabled = config.glassBlurEnabled
        this.glassOpacity = config.glassOpacity
        this.glassBlur = config.glassBlur
        this.glassBrightness = config.glassBrightness
        this.sidebarTransparent = config.sidebarTransparent
        this.sidebarOpacity = config.sidebarOpacity
        this.sidebarColor = config.sidebarColor
        this.rebuildView()
    })

    constructor (
        private store: WorkwenchStore,
        private platform: PlatformService,
        private host: SidebarHostService,
        private menu: ContextMenuService,
    ) { }

    setEnabled (enabled: boolean): void {
        this.enabled = enabled
        this.store.setEnabled(enabled)
    }

    setOpenDefault (openDefault: boolean): void {
        this.openDefault = openDefault
        this.store.setOpenDefault(openDefault)
    }

    setPaletteGrouped (paletteGrouped: boolean): void {
        this.paletteGrouped = paletteGrouped
        this.store.setPaletteGrouped(paletteGrouped)
    }

    /** Glass input commit; the store clamps to the valid ranges. */
    setGlass (key: 'glassBlurEnabled' | 'glassOpacity' | 'glassBlur' | 'glassBrightness', value: number | string | boolean): void {
        if (key === 'glassBlurEnabled') {
            this.glassBlurEnabled = value === true
            this.store.setGlass({ glassBlurEnabled: value === true })
            return
        }
        const parsed = Number(value)
        if (!Number.isFinite(parsed)) {
            return
        }
        this.store.setGlass({ [key]: parsed } as any)
    }

    /** Sidebar-mask style commit (toggle / opacity / colour). */
    setSidebarStyle (key: 'sidebarTransparent' | 'sidebarOpacity' | 'sidebarColor', value: number | string | boolean): void {
        let parsed: number | string | boolean = value
        if (key === 'sidebarOpacity') {
            parsed = Number(value)
            if (!Number.isFinite(parsed as number)) {
                return
            }
        }
        this.store.setSidebarStyle({ [key]: parsed } as any)
    }

    /** Session-local collapse state; filtering forces groups open so that
     *  matches stay visible regardless of the folder icon. */
    private readonly collapsedSceneIds = new Set<string>()

    toggleCollapse (sceneId: string): void {
        if (this.collapsedSceneIds.has(sceneId)) {
            this.collapsedSceneIds.delete(sceneId)
        } else {
            this.collapsedSceneIds.add(sceneId)
        }
    }

    isExpanded (sceneId: string): boolean {
        return !!this.filter.trim() || !this.collapsedSceneIds.has(sceneId)
    }

    /** One unified creation entry, like the profiles page's New dropdown. */
    openCreateMenu (event: MouseEvent): void {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
        this.menu.openAt(rect.left, rect.bottom + 4, [
            { label: '新增场景', action: () => this.addScene() },
            { label: '新增快捷按钮', action: () => this.addButton() },
        ])
    }

    addScene (): void {
        const sceneId = this.store.addScene()
        // Name the fresh scene right away, like Tabby's newProfileGroup.
        this.openSceneEditor(sceneId, '', '#a855f7', '', true)
    }

    /**
     * Draft-based creation: nothing is persisted until Save.  The editor's
     * group selector defaults to 无组别 (per spec: no group chosen →
     * ungrouped); all groups expand afterwards so the result is visible.
     */
    addButton (): void {
        const snippet: Snippet = { id: createId('snip'), name: '', text: '', color: '#22c55e' }
        const button: QuickButton = {
            type: 'quick-button',
            id: createId('btn'),
            snippetId: snippet.id,
            action: 'fill',
            appendCR: false,
            dangerAccepted: false,
        }
        this.openButtonEditor(UNGROUPED_SCENE_ID, snippet, button, true)
        this.collapsedSceneIds.clear()
    }

    /** Filter view: a scene shows when its name matches (then with all rows)
     *  or when any of its snippets match (then with only those rows). */
    rebuildView (): void {
        const q = this.filter.trim().toLowerCase()
        if (!q) {
            this.view = this.scenes.map(scene => ({ scene, showAll: true }))
            return
        }
        this.view = this.scenes
            .map(scene => ({
                scene,
                showAll: scene.name.toLowerCase().includes(q),
                hasMatch: scene.snippets.some(snippet =>
                    snippet.name.toLowerCase().includes(q) || snippet.text.toLowerCase().includes(q)),
            }))
            .filter(entry => entry.showAll || entry.hasMatch)
            .map(({ scene, showAll }) => ({ scene, showAll }))
    }

    editScene (scene: Scene): void {
        this.openSceneEditor(scene.id, scene.name, scene.color, scene.icon, false)
    }

    private openSceneEditor (sceneId: string, name: string, color: string, icon: string, isNew: boolean): void {
        const ref = this.host.openModal(SceneEditModalComponent, { sceneId, name, color, icon, isNew })
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

    private openButtonEditor (sceneId: string, snippet: Snippet, button: QuickButton, isNew: boolean): void {
        const ref = this.host.openModal(ButtonEditModalComponent, { sceneId, snippet, button, isNew })
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

    moveScene (sceneId: string, delta: number): void {
        this.store.moveScene(sceneId, delta)
    }

    async removeScene (scene: Scene): Promise<void> {
        if (this.scenes.length <= 1) {
            return
        }
        const result = await this.platform.showMessageBox({
            type: 'warning',
            buttons: ['删除', '保留'],
            defaultId: 1,
            cancelId: 1,
            message: `确定删除场景「${scene.name}」及其中全部快捷按钮和草稿？此操作不可撤销。`,
        })
        if (result.response !== 0) {
            return
        }
        this.store.removeScene(scene.id)
    }

    ngOnDestroy (): void {
        this.subscription.unsubscribe()
    }
}
