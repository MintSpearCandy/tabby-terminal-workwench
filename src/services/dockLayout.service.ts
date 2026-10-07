import { Injectable } from '@angular/core'
import { AppService, ConfigService } from 'tabby-core'
import { WorkwenchConfig } from '../types'
import { MIN_SIDEBAR_WIDTH, MIN_TERMINAL_WIDTH, LAYOUT_REFRESH_DELAY_MS, MAX_SIDEBAR_WIDTH } from '../constants'
import { TerminalBridgeService } from './terminalBridge.service'

/**
 * Docking mechanics: body-level classes and CSS variables, shrinking the
 * Tabby `.content` container, and nudging the terminal to recompute its
 * column layout after width changes.
 */
@Injectable({ providedIn: 'root' })
export class DockLayoutService {
    private contentContainer: HTMLElement | null = null
    private refreshFrame: number | null = null

    constructor (
        private app: AppService,
        private config: ConfigService,
        private bridge: TerminalBridgeService,
    ) { }

    private resizeRetryTimer: ReturnType<typeof setTimeout> | null = null

    applyState (model: Pick<WorkwenchConfig, 'enabled' | 'open' | 'width' | 'sidebarTransparent'>): void {
        const docked = model.enabled && model.open
        document.body.classList.toggle('twx-docked', docked)
        // Mask mode only changes what the sidebar sits on (the window
        // background layer, not its own underlay) — the terminal panes are
        // always squeezed aside, never covered.
        document.body.classList.toggle('twx-overlay', docked && model.sidebarTransparent)
        // Window-background layer for the (possibly translucent) sidebar and
        // any docked seam.  Tabby pins body transparent with !important, so
        // this needs the inline+important trump card; wallpaper-type themes
        // paint above body and still show through a translucent sidebar.
        if (docked) {
            document.body.style.setProperty('background-color', 'var(--twx-bg-deep)', 'important')
        } else {
            document.body.style.removeProperty('background-color')
        }
        this.applyTopOffset()
        if (docked) {
            this.applyWidth(model.width)
        } else {
            document.body.style.removeProperty('--twx-width')
            this.clearContentResize()
        }
        this.scheduleLayoutRefresh()
        this.scheduleResizeRetry(docked)
    }

    /**
     * The first applyState can run before Tabby restores its tabs, when the
     * content-container lookup finds nothing — retry once after the restore
     * window so the squeeze actually lands.
     */
    private scheduleResizeRetry (docked: boolean): void {
        if (this.resizeRetryTimer !== null) {
            clearTimeout(this.resizeRetryTimer)
            this.resizeRetryTimer = null
        }
        if (!docked) {
            return
        }
        this.resizeRetryTimer = setTimeout(() => {
            this.resizeRetryTimer = null
            const widthVar = document.body.style.getPropertyValue('--twx-width')
            if (widthVar) {
                this.resizeContentContainer(parseInt(widthVar, 10))
                this.scheduleLayoutRefresh()
            }
        }, 1500)
    }

    /**
     * Align the sidebar's top edge with the bottom of Tabby's top chrome
     * (title bar + tab strip).  A hardcoded offset leaves a white
     * window-background gap whenever the actual chrome height differs — the
     * inner .content (sibling of .tab-bar inside .content.main) starts
     * exactly below that chrome in every layout mode.
     */
    private applyTopOffset (): void {
        const pageArea = document.querySelector('.content.main > .content')
        if (!pageArea) {
            return
        }
        const top = Math.max(0, Math.round(pageArea.getBoundingClientRect().top))
        document.body.style.setProperty('--twx-top', `${top}px`)
    }

    /** Continuous width application during a drag; persistence is the caller's job. */
    applyWidth (width: number): void {
        const clamped = this.clampWidth(width)
        document.body.style.setProperty('--twx-width', `${clamped}px`)
        this.resizeContentContainer(clamped)
    }

    clearContentResize (): void {
        if (this.contentContainer && document.contains(this.contentContainer)) {
            this.contentContainer.style.removeProperty('width')
            this.contentContainer.style.removeProperty('max-width')
        }
        this.contentContainer = null
    }

    getMaxWidth (): number {
        return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - MIN_TERMINAL_WIDTH))
    }

    clampWidth (width: number): number {
        return Math.round(Math.min(this.getMaxWidth(), Math.max(MIN_SIDEBAR_WIDTH, width)))
    }

    /**
     * Make the actual Tabby content container narrower than 100vw so the
     * fixed sidebar does not cover terminal text.  CSS alone cannot do this
     * reliably, so walk the DOM from the active terminal (or any tab) to the
     * nearest `.content` element and set its width explicitly.
     */
    private resizeContentContainer (width: number): void {
        const clamped = this.clampWidth(width)
        const value = `calc(100vw - ${clamped}px)`

        if (!this.contentContainer || !document.contains(this.contentContainer)) {
            this.contentContainer = this.findContentContainer()
        }
        if (!this.contentContainer) {
            return
        }
        this.contentContainer.style.width = value
        this.contentContainer.style.maxWidth = value
    }

    private findContentContainer (): HTMLElement | null {
        // Strategy 1: navigate up from the active terminal's DOM element.
        const terminal = this.bridge.findActiveTerminal()
        if (terminal?.element?.nativeElement) {
            let el: HTMLElement = terminal.element.nativeElement as HTMLElement
            while (el && el.tagName !== 'APP-ROOT' && el !== document.body) {
                if (el.classList.contains('content')) {
                    return el
                }
                el = el.parentElement!
            }
        }

        // Strategy 2: find tab-body/split-tab and use closest('.content').
        const tabBody = document.querySelector('tab-body, split-tab')
        if (tabBody) {
            const content = tabBody.closest<HTMLElement>('.content')
            if (content) {
                return content
            }
        }

        // Strategy 3: parent of any .content-tab element.
        const contentTab = document.querySelector('.content-tab')
        if (contentTab?.parentElement) {
            return contentTab.parentElement as HTMLElement
        }

        return null
    }

    /** Ask the active tab and the terminal frontend to recompute layout. */
    scheduleLayoutRefresh (): void {
        if (this.refreshFrame !== null) {
            cancelAnimationFrame(this.refreshFrame)
        }
        const refresh = (): void => {
            this.refreshFrame = null
            this.applyTopOffset()
            const active = this.app.activeTab as any
            if (typeof active?.layout === 'function') {
                active.layout()
            }
            window.dispatchEvent(new Event('resize'))
        }
        this.refreshFrame = requestAnimationFrame(() => {
            refresh()
            setTimeout(refresh, LAYOUT_REFRESH_DELAY_MS)
        })
    }
}
