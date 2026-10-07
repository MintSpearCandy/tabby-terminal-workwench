import { Component, OnDestroy } from '@angular/core'
import { DockLayoutService } from '../services/dockLayout.service'
import { ExecutorService } from '../services/executor.service'
import { PaletteService } from '../services/palette.service'
import { TargetState, TerminalBridgeService } from '../services/terminalBridge.service'
import { WorkwenchConfig } from '../types'
import { WorkwenchStore } from '../services/store.service'

/**
 * Sidebar shell, hosted directly under document.body by the
 * SidebarHostService.  Owns the resize handle and the header; content
 * sections are child components.
 */
@Component({
    selector: 'twx-sidebar-root',
    template: `
        <aside class="twx-root" *ngIf="visible">
            <div class="twx-resize-handle"
                 title="拖动调整面板宽度"
                 (pointerdown)="startResize($event)"></div>
            <header class="twx-header">
                <div class="twx-target-line" [class.is-error]="!target.label">
                    <span *ngIf="target.remote"
                          class="twx-status-light"
                          [class.is-on]="target.connected"
                          [title]="target.connected ? '会话已连接' : '会话未连接'"></span>
                    <span class="twx-target">{{ target.label || '未找到活动终端' }}</span>
                </div>
                <div class="twx-header-actions">
                    <button type="button" class="twx-btn is-danger"
                            *ngIf="sequenceRunning"
                            (click)="cancelSequence()">停止</button>
                    <button type="button" class="twx-btn twx-icon-btn"
                            title="快捷搜索片段"
                            (click)="openPalette()">
                        <i class="fas fa-search"></i>
                    </button>
                    <button type="button" class="twx-btn twx-icon-btn"
                            title="收起面板"
                            (click)="close()">×</button>
                </div>
            </header>
            <twx-scene-tabs></twx-scene-tabs>
            <div class="twx-body">
                <twx-quick-grid></twx-quick-grid>
                <twx-scratchpad></twx-scratchpad>
            </div>
            <twx-status-toast></twx-status-toast>
        </aside>
    `,
})
export class SidebarRootComponent implements OnDestroy {
    visible = true
    target: TargetState = { label: '', remote: false, connected: false }
    sequenceRunning = false
    private readonly subscription = this.store.config$.subscribe(model => {
        this.visible = model.enabled && model.open
        this.applyStyleVars(model)
    })

    /** Glass / sidebar-mask tunables drive the CSS through body-level vars. */
    private applyStyleVars (model: WorkwenchConfig): void {
        const body = document.body.style
        body.setProperty('--twx-glass-opacity', String(model.glassOpacity))
        body.setProperty('--twx-glass-blur', `${model.glassBlur}px`)
        body.setProperty('--twx-glass-brightness', String(model.glassBrightness))
        // Translucent mask: the chosen base colour at the chosen opacity;
        // opaque mode keeps the theme default (var unset → CSS fallback).
        body.removeProperty('--twx-sidebar-bg')
        if (model.sidebarTransparent) {
            const hex = /^#[0-9a-f]{6}$/i.test(model.sidebarColor) ? model.sidebarColor : '#111b2c'
            const r = parseInt(hex.slice(1, 3), 16)
            const g = parseInt(hex.slice(3, 5), 16)
            const b = parseInt(hex.slice(5, 7), 16)
            body.setProperty('--twx-sidebar-bg', `rgba(${r}, ${g}, ${b}, ${model.sidebarOpacity})`)
        }
    }

    constructor (
        private store: WorkwenchStore,
        private bridge: TerminalBridgeService,
        private dock: DockLayoutService,
        private executor: ExecutorService,
        private palette: PaletteService,
    ) {
        this.bridge.target$.subscribe(target => {
            this.target = target
        })
        this.executor.sequenceRunning$.subscribe(running => {
            this.sequenceRunning = running
        })
    }

    /** Quick-search palette over all snippets (see PaletteService). */
    openPalette (): void {
        this.palette.open()
    }

    close (): void {
        this.store.setOpen(false)
        queueMicrotask(() => this.bridge.focusActiveTerminal())
    }

    cancelSequence (): void {
        this.executor.cancelSequence()
    }

    startResize (event: PointerEvent): void {
        if (event.button !== 0) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        const handle = event.currentTarget as HTMLElement
        const startX = event.clientX
        const startWidth = this.store.snapshot.width
        handle.setPointerCapture(event.pointerId)
        document.body.classList.add('twx-resizing')

        const onMove = (moveEvent: PointerEvent): void => {
            const width = this.dock.clampWidth(startWidth + startX - moveEvent.clientX)
            this.dock.applyWidth(width)
            this.store.setDraggingWidth(width)
            this.dock.scheduleLayoutRefresh()
        }
        const pointerId = event.pointerId
        let cleaned = false
        const cleanup = (): void => {
            if (cleaned) {
                return
            }
            cleaned = true
            if (handle.hasPointerCapture(pointerId)) {
                handle.releasePointerCapture(pointerId)
            }
            document.body.classList.remove('twx-resizing')
            window.removeEventListener('pointermove', onMove, true)
            window.removeEventListener('pointerup', onUp, true)
            window.removeEventListener('pointercancel', cleanup, true)
            window.removeEventListener('blur', cleanup, true)
            handle.removeEventListener('lostpointercapture', cleanup)
            this.store.flushPendingSaves()
        }
        const onUp = (): void => {
            cleanup()
        }

        window.addEventListener('pointermove', onMove, true)
        window.addEventListener('pointerup', onUp, true)
        window.addEventListener('pointercancel', cleanup, true)
        window.addEventListener('blur', cleanup, true)
        handle.addEventListener('lostpointercapture', cleanup)
    }

    ngOnDestroy (): void {
        this.subscription.unsubscribe()
    }
}
