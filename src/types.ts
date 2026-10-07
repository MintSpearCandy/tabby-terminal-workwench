export type QuickButtonAction = 'fill' | 'copy'

/**
 * The basic content unit of the plugin: a named piece of terminal text.
 * Snippets are pure content — they say nothing about how they are invoked.
 */
export interface Snippet {
    id: string
    name: string
    text: string
    color: string
}

/**
 * One way to invoke a snippet.  Quick buttons are the sidebar-grid binding;
 * the `type` discriminator reserves room for future invokers (palette
 * entries, hotkeys, …) without another migration of the invocation config.
 */
export interface SnippetBinding {
    type: 'quick-button'
    id: string
    snippetId: string
    action: QuickButtonAction
    appendCR: boolean
    dangerAccepted: boolean
}

/** The quick-button binding shown in a scene's sidebar grid. */
export interface QuickButton extends SnippetBinding { }

/** A binding joined with the snippet it references, for rendering/execution. */
export interface ResolvedButton {
    binding: QuickButton
    snippet: Snippet
}

/**
 * Grouping unit.  Scenes currently play the group role for both snippets
 * and their quick-button bindings; a dedicated 分组 concept can supersede
 * this later without touching the snippet/binding split.
 */
export interface Scene {
    id: string
    name: string
    color: string
    /** Font Awesome class(es), e.g. 'fas fa-server'; empty = folder. */
    icon: string
    scratchpad: string
    snippets: Snippet[]
    buttons: QuickButton[]
}

export interface WorkwenchConfig {
    version: 2
    enabled: boolean
    /** Persisted startup default — the only "open" value written to config. */
    openDefault: boolean
    /** Quick-search palette: show results grouped by scene (settings-page
     *  style headers) instead of a flat list. */
    paletteGrouped: boolean
    /** Quick-card frosted glass: how much snippet colour tints the card
     *  background (0–1). */
    glassOpacity: number
    /** Quick-card frosted glass: backdrop blur radius in px (0–40). */
    glassBlur: number
    /** Quick-card frosted glass: backdrop brightness factor (0.2–2). */
    glassBrightness: number
    /** Sidebar background as a translucent mask over the window. */
    sidebarTransparent: boolean
    /** Sidebar mask opacity (0–1), applied in transparent mode. */
    sidebarOpacity: number
    /** Sidebar mask base colour (#rrggbb), applied in transparent mode. */
    sidebarColor: string
    /** Session-only visibility, controlled by the toolbar button / sidebar
     *  close button.  Never persisted; initialized from openDefault. */
    open: boolean
    width: number
    activeSceneId: string
    importedFromWorkbench: boolean
    scenes: Scene[]
}

/**
 * Minimal shapes of the tabby-command-workbench persisted config that we read
 * as a one-time import source.  Only the fields we actually consume are
 * declared; `commonCommands` is intentionally absent because the new product
 * has no such entity.
 */
export interface WorkbenchSourceCategory {
    id?: string
    name?: string
    color?: string
    scratchpad?: string
    quickButtons?: Array<Partial<Snippet>>
    tempSnippets?: Array<{ text?: string }>
}

export interface WorkbenchSourceConfig {
    enabled?: boolean
    sidebarOpen?: boolean
    sidebarWidth?: number
    activeCategoryId?: string
    categories?: WorkbenchSourceCategory[]
}
