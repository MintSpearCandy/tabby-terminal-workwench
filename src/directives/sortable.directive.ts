import { Directive, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core'
import { clampGridDragPosition, getDirectionalSortProbe, getEffectiveSortMovement, SortDirection } from '../sortableGeometry'
import { findSortAnchor, getSortableLayoutRect, scrollSortableContainer } from '../sortableDom'
import { DRAG_ACTIVATION_PX, DRAG_CLICK_SUPPRESS_MS } from '../constants'

interface PointerSession {
    source: HTMLElement
    pointerId: number
    startClientX: number
    startClientY: number
    grabOffsetX: number
    grabOffsetY: number
    active: boolean
    translateX: number
    translateY: number
    lastClientX: number
    lastClientY: number
    lastVisualLeft: number
    lastVisualTop: number
    lastScrollLeft: number
    lastScrollTop: number
}

/**
 * Pointer-follow drag sorting with FLIP animations, ported from
 * tabby-command-workbench's battle-tested `enableAnimatedSorting`.
 *
 * Differences required by Angular hosting:
 * - the container listens for `pointerdown` itself and resolves the dragged
 *   item via `closest(itemSelector)`, so `*ngFor` add/remove cannot detach
 *   handlers from items
 * - while dragging, the item's DOM node is physically moved; on drop the
 *   committed order is emitted so the component can update its model — with
 *   `trackBy: id` the differ reconciles to exactly the same DOM order
 * - a trailing click right after a drag is swallowed so the button under the
 *   cursor does not fire
 */
@Directive({ selector: '[appSortable]' })
export class SortableDirective implements OnInit, OnDestroy {
    /** Sort direction: 'horizontal' | 'vertical' | 'grid'. */
    @Input() appSortable: SortDirection = 'grid'
    /** Selector matching the sortable child items inside the container. */
    @Input() appSortableItem = '.twx-quick-card'
    /** Emits the item ids in their new visual order when a drag ends. */
    @Output() appSortableCommit = new EventEmitter<string[]>()

    private pointerSession: PointerSession | null = null
    private suppressedClickId: string | null = null
    private suppressedClickTimer: number | null = null
    private readonly reorderAnimations = new WeakMap<HTMLElement, Animation>()
    private destroyed = false

    constructor (
        private element: ElementRef<HTMLElement>,
    ) { }

    private get container (): HTMLElement {
        return this.element.nativeElement
    }

    ngOnInit (): void {
        const container = this.container
        container.addEventListener('pointerdown', this.onPointerDown)
        container.addEventListener('click', this.onContainerClick, true)
    }

    ngOnDestroy (): void {
        this.destroyed = true
        const container = this.container
        container.removeEventListener('pointerdown', this.onPointerDown)
        container.removeEventListener('click', this.onContainerClick, true)
        this.removeWindowListeners()
        if (this.suppressedClickTimer !== null) {
            clearTimeout(this.suppressedClickTimer)
        }
    }

    // ── event handlers (bound arrows for stable identity) ───────────────

    private readonly onPointerDown = (event: PointerEvent): void => {
        if (event.button !== 0 || !event.isPrimary || this.pointerSession) {
            return
        }
        const target = event.target as HTMLElement | null
        const source = target?.closest<HTMLElement>(this.appSortableItem)
        if (!source || !this.container.contains(source)) {
            return
        }
        this.reorderAnimations.get(source)?.cancel()
        const rect = source.getBoundingClientRect()
        this.pointerSession = {
            source,
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            grabOffsetX: event.clientX - rect.left,
            grabOffsetY: event.clientY - rect.top,
            active: false,
            translateX: 0,
            translateY: 0,
            lastClientX: event.clientX,
            lastClientY: event.clientY,
            lastVisualLeft: rect.left,
            lastVisualTop: rect.top,
            lastScrollLeft: this.container.scrollLeft,
            lastScrollTop: this.container.scrollTop,
        }
        window.addEventListener('pointermove', this.onPointerMove, true)
        window.addEventListener('pointerup', this.onPointerUp, true)
        window.addEventListener('pointercancel', this.onPointerCancel, true)
        window.addEventListener('blur', this.onWindowBlur)
    }

    private readonly onPointerMove = (event: PointerEvent): void => {
        const session = this.pointerSession
        if (!session || event.pointerId !== session.pointerId) {
            return
        }

        const movementX = event.clientX - session.startClientX
        const movementY = event.clientY - session.startClientY
        if (!session.active) {
            if (Math.hypot(movementX, movementY) < DRAG_ACTIVATION_PX) {
                return
            }
            session.active = true
            session.source.setPointerCapture(session.pointerId)
            session.source.classList.add('is-dragging')
            session.source.style.willChange = 'transform'
            document.body.classList.add('twx-sorting')
            this.reorderAnimations.get(session.source)?.cancel()
        }

        event.preventDefault()
        scrollSortableContainer(this.container, this.appSortable, event)
        this.updateDraggedPosition(session, event.clientX, event.clientY)

        const draggingRect = session.source.getBoundingClientRect()
        const pointerDeltaX = event.clientX - session.lastClientX
        const pointerDeltaY = event.clientY - session.lastClientY
        const movement = getEffectiveSortMovement(
            this.appSortable,
            pointerDeltaX,
            pointerDeltaY,
            draggingRect.left - session.lastVisualLeft + this.container.scrollLeft - session.lastScrollLeft,
            draggingRect.top - session.lastVisualTop + this.container.scrollTop - session.lastScrollTop,
        )
        session.lastClientX = event.clientX
        session.lastClientY = event.clientY
        session.lastScrollLeft = this.container.scrollLeft
        session.lastScrollTop = this.container.scrollTop
        if (!movement) {
            session.lastVisualLeft = draggingRect.left
            session.lastVisualTop = draggingRect.top
            return
        }
        const probe = getDirectionalSortProbe(draggingRect, this.appSortable, movement.deltaX, movement.deltaY)
        const siblings = this.items().filter(item => item !== session.source)
        const anchor = findSortAnchor(siblings, this.appSortable, probe)
        if (anchor && session.source.nextElementSibling !== anchor) {
            this.animateReorder(() => this.container.insertBefore(session.source, anchor), session.source)
            this.updateDraggedPosition(session, event.clientX, event.clientY)
        } else if (!anchor && this.container.lastElementChild !== session.source) {
            this.animateReorder(() => this.container.appendChild(session.source), session.source)
            this.updateDraggedPosition(session, event.clientX, event.clientY)
        }
        const updatedRect = session.source.getBoundingClientRect()
        session.lastVisualLeft = updatedRect.left
        session.lastVisualTop = updatedRect.top
    }

    private readonly onPointerUp = (event: PointerEvent): void => {
        const session = this.pointerSession
        if (!session || event.pointerId !== session.pointerId) {
            return
        }
        if (session.active) {
            event.preventDefault()
        }
        this.finishPointerDrag()
    }

    private readonly onPointerCancel = (event: PointerEvent): void => {
        if (this.pointerSession && event.pointerId === this.pointerSession.pointerId) {
            this.finishPointerDrag()
        }
    }

    private readonly onWindowBlur = (): void => {
        this.finishPointerDrag()
    }

    private readonly onContainerClick = (event: Event): void => {
        if (!this.suppressedClickId) {
            return
        }
        event.preventDefault()
        event.stopImmediatePropagation()
        this.suppressedClickId = null
    }

    // ── drag mechanics ──────────────────────────────────────────────────

    private items (): HTMLElement[] {
        return Array.from(this.container.querySelectorAll<HTMLElement>(this.appSortableItem))
    }

    private updateDraggedPosition (session: PointerSession, clientX: number, clientY: number): void {
        const container = this.container
        const rect = session.source.getBoundingClientRect()
        const layoutLeft = rect.left - session.translateX
        const layoutTop = rect.top - session.translateY
        const containerRect = container.getBoundingClientRect()
        const bounds = {
            left: containerRect.left,
            top: containerRect.top,
            right: containerRect.left + container.clientWidth,
            bottom: containerRect.top + container.clientHeight,
            width: container.clientWidth,
            height: container.clientHeight,
        }
        const rawDesiredLeft = clientX - session.grabOffsetX
        const rawDesiredTop = clientY - session.grabOffsetY
        const maxLeft = Math.max(bounds.left, bounds.right - rect.width)
        const maxTop = Math.max(bounds.top, bounds.bottom - rect.height)
        const clamped = this.appSortable === 'grid'
            ? clampGridDragPosition(
                this.items().map(item => getSortableLayoutRect(item)),
                rect.width,
                rect.height,
                { left: rawDesiredLeft, top: rawDesiredTop },
                bounds,
            )
            : {
                left: Math.min(maxLeft, Math.max(bounds.left, rawDesiredLeft)),
                top: Math.min(maxTop, Math.max(bounds.top, rawDesiredTop)),
            }
        session.translateX = this.appSortable === 'vertical' ? 0 : clamped.left - layoutLeft
        session.translateY = this.appSortable === 'horizontal' ? 0 : clamped.top - layoutTop
        session.source.style.transform = `translate(${session.translateX}px, ${session.translateY}px)`
    }

    private finishPointerDrag (): void {
        const session = this.pointerSession
        if (!session) {
            return
        }
        this.removeWindowListeners()
        if (session.source.hasPointerCapture(session.pointerId)) {
            session.source.releasePointerCapture(session.pointerId)
        }
        this.pointerSession = null
        if (!session.active) {
            return
        }

        session.source.classList.remove('is-dragging')
        document.body.classList.remove('twx-sorting')

        // Emit while the source still has its transform removed, so the
        // component's model update lands before the browser paints the drop.
        this.animateReorder(() => {
            session.source.style.removeProperty('transform')
            session.source.style.removeProperty('will-change')
        })
        const orderedIds = this.items().map(item => item.dataset.sortableId || '')
        if (!this.destroyed) {
            this.appSortableCommit.emit(orderedIds)
        }
        this.suppressTrailingClick(session.source.dataset.sortableId || '')
    }

    private animateReorder (reorder: () => void, excluded?: HTMLElement): void {
        const currentItems = this.items()
        const previousPositions = new Map(currentItems.map(item => [item, item.getBoundingClientRect()]))
        for (const item of currentItems) {
            this.reorderAnimations.get(item)?.cancel()
        }

        reorder()
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return
        }

        for (const item of currentItems) {
            if (item === excluded) {
                continue
            }
            const previous = previousPositions.get(item)
            const current = item.getBoundingClientRect()
            const deltaX = previous ? previous.left - current.left : 0
            const deltaY = previous ? previous.top - current.top : 0
            if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
                continue
            }
            const animation = item.animate(
                [
                    { transform: `translate(${deltaX}px, ${deltaY}px)` },
                    { transform: 'translate(0, 0)' },
                ],
                { duration: 170, easing: 'cubic-bezier(.2, 0, 0, 1)' },
            )
            this.reorderAnimations.set(item, animation)
            const cleanup = (): void => {
                if (this.reorderAnimations.get(item) === animation) {
                    this.reorderAnimations.delete(item)
                }
            }
            animation.addEventListener('finish', cleanup, { once: true })
            animation.addEventListener('cancel', cleanup, { once: true })
        }
    }

    private suppressTrailingClick (id: string): void {
        this.suppressedClickId = id
        if (this.suppressedClickTimer !== null) {
            clearTimeout(this.suppressedClickTimer)
        }
        this.suppressedClickTimer = window.setTimeout(() => {
            this.suppressedClickId = null
            this.suppressedClickTimer = null
        }, DRAG_CLICK_SUPPRESS_MS)
    }

    private removeWindowListeners (): void {
        window.removeEventListener('pointermove', this.onPointerMove, true)
        window.removeEventListener('pointerup', this.onPointerUp, true)
        window.removeEventListener('pointercancel', this.onPointerCancel, true)
        window.removeEventListener('blur', this.onWindowBlur)
    }
}
