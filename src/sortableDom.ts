import { findSortAnchorIndex, SortableRect, SortDirection, SortProbe } from './sortableGeometry'

/**
 * Layout rect of an element with any active drag `transform` removed, so
 * geometry decisions operate on the slot position rather than the visual
 * follow-pointer offset.
 */
export function getSortableLayoutRect (element: HTMLElement): SortableRect {
    const rect = element.getBoundingClientRect()
    const transform = window.getComputedStyle(element).transform
    if (!transform || transform === 'none') {
        return rect as SortableRect
    }
    try {
        const matrix = new DOMMatrixReadOnly(transform)
        const left = rect.left - matrix.m41
        const top = rect.top - matrix.m42
        return {
            left,
            top,
            right: left + rect.width,
            bottom: top + rect.height,
            width: rect.width,
            height: rect.height,
        }
    } catch {
        return rect as SortableRect
    }
}

/** Sibling element that the dragged item should be inserted before, if any. */
export function findSortAnchor (
    siblings: HTMLElement[],
    direction: SortDirection,
    probe: SortProbe,
): HTMLElement | null {
    const layouts = siblings.map(element => ({ element, rect: getSortableLayoutRect(element) }))
    const anchorIndex = findSortAnchorIndex(layouts.map(layout => layout.rect), direction, probe)
    return anchorIndex < 0 || anchorIndex >= layouts.length
        ? null
        : layouts[anchorIndex].element
}

/** Auto-scroll the sortable container when the pointer nears its edges. */
export function scrollSortableContainer (
    container: HTMLElement,
    direction: SortDirection,
    event: MouseEvent,
): void {
    const rect = container.getBoundingClientRect()
    const edgeSize = 24
    const scrollStep = 12
    if (direction === 'horizontal') {
        if (event.clientX < rect.left + edgeSize) {
            container.scrollLeft -= scrollStep
        } else if (event.clientX > rect.right - edgeSize) {
            container.scrollLeft += scrollStep
        }
        return
    }
    if (event.clientY < rect.top + edgeSize) {
        container.scrollTop -= scrollStep
    } else if (event.clientY > rect.bottom - edgeSize) {
        container.scrollTop += scrollStep
    }
}
