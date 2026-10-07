/**
 * Plugin stylesheet (injected as a single global <style> element).
 *
 * Must only reference `--twx-*` design tokens (defined in theme.ts) or
 * layout/spacing values — never hard-coded colours.
 *
 * Class prefix `twx-` is intentionally unique to avoid collisions with Tabby
 * core and other plugins.
 */

export const GLOBAL_STYLES = `
    .twx-root, .twx-root * { box-sizing: border-box; }

    /* ── Docking: make the main window leave room for the sidebar ── */
    /* The window-background layer itself is painted inline on body by the
     * DockLayoutService (docked → var(--twx-bg-deep)), so a translucent
     * sidebar sits on it and wallpaper-type themes can paint over it. */
    body.twx-docked app-root {
        width: 100vw !important;
        max-width: 100vw !important;
        min-width: 0 !important;
        overflow: hidden !important;
    }
    body.twx-docked tab-body,
    body.twx-docked split-tab,
    body.twx-docked base-terminal-tab,
    body.twx-docked .xterm,
    body.twx-docked .xterm-screen,
    body.twx-docked .xterm-viewport {
        max-width: 100% !important;
        overflow: hidden !important;
    }
    body.twx-resizing, body.twx-resizing * {
        cursor: col-resize !important;
        user-select: none !important;
    }
    body.twx-sorting, body.twx-sorting * {
        cursor: grabbing !important;
        user-select: none !important;
    }

    /* ── Sidebar shell (top tracks Tabby's chrome bottom via --twx-top) ── */
    .twx-root {
        position: fixed; top: var(--twx-top, 42px); right: 0; bottom: 0; z-index: 10000;
        display: flex; width: min(var(--twx-width, 390px), calc(100vw - 20px));
        flex-direction: column; overflow: hidden;
        container-type: inline-size;
        border-left: 1px solid var(--twx-border-strong);
        color: var(--twx-fg); background: var(--twx-sidebar-bg, var(--twx-bg-deep));
        box-shadow: -14px 0 30px var(--twx-shadow-sm);
        font-family: Inter, "Segoe UI", sans-serif; -webkit-app-region: no-drag;
    }
    /* Window-background layer under the translucent mask: the element chain
     * below the sidebar is fully transparent (Tabby paints no body
     * background), so at mask opacity 0 the raw white Electron window would
     * show through — pin the theme's deepest background inside the sidebar
     * bounds instead (z-index -1 stays trapped in the root's stacking
     * context, so nothing outside the sidebar is affected). */
    .twx-root::before {
        content: ""; position: absolute; inset: 0; z-index: -1;
        background: var(--twx-sidebar-underlay, var(--twx-bg-deep));
    }
    /* Mask mode: drop the sidebar's own underlay — the translucent root then
     * sits directly on the window-background layer painted on body (theme
     * colour, or a wallpaper painted there by theme plugins).  Terminal
     * panes stay squeezed beside the sidebar; nothing is covered. */
    body.twx-overlay .twx-root::before { display: none; }
    .twx-resize-handle {
        position: absolute; top: 0; bottom: 0; left: -4px; z-index: 3;
        width: 8px; cursor: col-resize; touch-action: none;
    }
    .twx-resize-handle::before {
        content: ""; position: absolute; top: 0; bottom: 0; left: 3px;
        width: 1px; background: var(--twx-border);
    }
    .twx-resize-handle:hover::before,
    body.twx-resizing .twx-resize-handle::before {
        left: 2px; width: 3px; background: var(--twx-accent);
    }

    /* ── Header: session target + SSH status light ── */
    .twx-header {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 5px 12px; border-bottom: 1px solid var(--twx-border-dim);
    }
    .twx-target-line {
        display: flex; min-width: 0; flex: 1; align-items: center; gap: 7px;
    }
    .twx-target {
        overflow: hidden; color: var(--twx-fg); font-size: 12.5px; font-weight: 600;
        text-overflow: ellipsis; white-space: nowrap;
    }
    .twx-target-line.is-error .twx-target { color: var(--twx-danger-fg); font-weight: 400; }
    .twx-status-light {
        flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%;
        background: var(--twx-danger);
        box-shadow: 0 0 6px color-mix(in srgb, var(--twx-danger) 60%, transparent);
    }
    .twx-status-light.is-on {
        background: var(--twx-success);
        box-shadow: 0 0 6px color-mix(in srgb, var(--twx-success) 60%, transparent);
    }
    .twx-header-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; }

    /* ── Scene tabs (Chrome-style strip) ── */
    .twx-scene-strip {
        display: flex; flex: 0 0 auto;
        background: color-mix(in srgb, var(--twx-fg) 4%, transparent);
        border-bottom: 1px solid var(--twx-border);
    }
    /* No scrollbar-width override (that would disable the ::-webkit-scrollbar
     * rules); instead the strip gets a slimmer variant of the global style. */
    .twx-scene-tabs {
        display: flex; min-width: 0; flex: 1; gap: 2px; align-items: flex-end;
        padding: 8px 8px 0;
        overflow-x: auto; overflow-y: hidden;
    }
    .twx-scene-tabs::-webkit-scrollbar {
        background: var(--twx-scrollbar-track);
        height: 5px; margin: 2px;
    }
    .twx-scene-tabs::-webkit-scrollbar-thumb {
        background: var(--twx-scrollbar-thumb);
    }
    .twx-scene-tab {
        position: relative; z-index: 1; display: inline-flex; flex: 0 0 auto;
        align-items: center; gap: 6px;
        min-height: 30px; padding: 5px 12px 6px; margin-bottom: -1px;
        border: 0; border-radius: 8px 8px 0 0;
        color: var(--twx-fg-muted); background: transparent; cursor: pointer;
        user-select: none; -webkit-user-select: none;
        font-size: 12px; line-height: 1.2; font-family: inherit;
        transition: background-color .12s ease, color .12s ease;
    }
    .twx-scene-tab:hover {
        color: var(--twx-fg);
        background: color-mix(in srgb, var(--twx-fg) 7%, transparent);
    }
    .twx-scene-tab.is-active {
        color: var(--twx-fg-emphasis);
        background: var(--twx-sidebar-bg, var(--twx-bg-deep));
    }
    /* Chrome-tab shoulder curves: fill with the active-tab (= panel) bg */
    .twx-scene-tab.is-active::before,
    .twx-scene-tab.is-active::after {
        content: ""; position: absolute; bottom: 0;
        width: 8px; height: 8px; pointer-events: none;
    }
    .twx-scene-tab.is-active::before {
        left: -8px; border-bottom-right-radius: 8px;
        box-shadow: 4px 4px 0 0 var(--twx-sidebar-bg, var(--twx-bg-deep));
    }
    .twx-scene-tab.is-active::after {
        right: -8px; border-bottom-left-radius: 8px;
        box-shadow: -4px 4px 0 0 var(--twx-sidebar-bg, var(--twx-bg-deep));
    }
    /* Scene icon left of the tab title, painted with the exact scene colour
     * (replaced the former top colour line). */
    .twx-scene-tab-icon { flex: 0 0 auto; font-size: 12px; line-height: 1; }

    /* ── Component host elements must participate in the flex column ── */
    twx-scene-tabs { display: block; flex: 0 0 auto; }
    /* Quick section: content-sized to its button rows, capped against the
     * definite-height .twx-body (a % max on the inner grid would resolve
     * against an indefinite parent and silently do nothing). */
    twx-quick-grid { display: flex; flex: 0 1 auto; min-height: 0; max-height: 60%; flex-direction: column; }
    twx-scratchpad { display: flex; flex: 1 1 auto; min-height: 120px; flex-direction: column; }
    twx-status-toast { display: block; }

    /* ── Body sections ── */
    .twx-body {
        display: flex; min-height: 0; flex: 1;
        padding: clamp(8px, 2.5cqi, 12px);
        flex-direction: column; overflow: hidden;
    }
    .twx-section--quick {
        display: flex; min-height: 0; flex: 1 1 auto; margin-bottom: 12px; flex-direction: column;
    }
    .twx-section--scratch {
        display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column;
    }
    .twx-section-header {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        margin-bottom: 8px;
    }
    .twx-section-title { display: flex; align-items: center; gap: 7px; }
    .twx-section-title strong { font-size: 13px; }
    .twx-section-title span {
        min-width: 20px; padding: 1px 6px; border-radius: 999px;
        color: var(--twx-fg-muted); background: var(--twx-bg-raised);
        font-size: 10px; text-align: center;
    }
    .twx-section-title small { color: var(--twx-fg-subtle); font-size: 9px; font-weight: 400; }

    /* ── Quick button grid (rows size the section; scrolls past the host cap) ── */
    .twx-quick-grid {
        display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px;
        grid-auto-rows: 38px; min-height: 0; flex: 1 1 auto;
        align-content: start; overflow-x: hidden; overflow-y: auto; padding-right: 2px;
    }
    /* Frosted-glass quick cards: snippet colour at a configurable amount
     * (color concentration) over a blurred, brightness-adjusted backdrop.
     * Glass vars are set on <body> from config by the sidebar root; the
     * fallbacks equal the model defaults. */
    .twx-quick-card {
        position: relative; min-width: 0; overflow: hidden;
        border: 1px solid var(--item-color);
        border-radius: 8px;
        background: color-mix(in srgb, var(--item-color) calc(var(--twx-glass-opacity, .15) * 100%), transparent);
        backdrop-filter: blur(var(--twx-glass-blur, 8px)) brightness(var(--twx-glass-brightness, 1));
        box-shadow: inset 0 1px 0 color-mix(in srgb, var(--twx-fg) 12%, transparent);
        cursor: grab; user-select: none; -webkit-user-select: none;
    }
    .twx-quick-card.is-dragging {
        z-index: 1; cursor: grabbing;
        box-shadow: var(--twx-shadow-sm), inset 0 1px 0 color-mix(in srgb, var(--twx-fg) 12%, transparent);
    }
    .twx-quick-card.is-dangerous {
        border-color: var(--twx-danger);
        background: color-mix(in srgb, var(--twx-danger) 8%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--twx-danger) 25%, transparent);
    }
    .twx-quick-card.is-dragging * { cursor: grabbing !important; }
    /* Action-type badge, top-right corner of the card */
    .twx-quick-badge {
        position: absolute; top: 3px; right: 3px; z-index: 1;
        padding: 1px 5px; border-radius: 5px;
        color: var(--twx-fg-muted);
        background: color-mix(in srgb, var(--twx-fg) 12%, transparent);
        font-size: 8.5px; font-weight: 600; line-height: 1.5;
        pointer-events: none;
    }
    .twx-quick-badge.is-send {
        color: var(--twx-warning-fg);
        background: color-mix(in srgb, var(--twx-warning) 30%, transparent);
    }
    .twx-quick-badge.is-copy {
        color: var(--twx-info);
        background: color-mix(in srgb, var(--twx-info) 22%, transparent);
    }
    .twx-quick-badge.is-dangerous {
        color: var(--twx-danger-fg);
        background: color-mix(in srgb, var(--twx-danger) 32%, transparent);
    }
    .twx-quick-execute {
        display: flex; width: 100%; min-height: 38px; padding: 6px;
        align-items: center; justify-content: center;
        border: 0; color: var(--twx-fg-emphasis); background: transparent; cursor: pointer;
        text-align: center; font-weight: 700; line-height: 1.2;
        font-family: inherit;
    }
    .twx-quick-label {
        display: block; max-width: 100%; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; font-size: 12px;
    }
    .twx-quick-empty {
        padding: 14px; border: 1px dashed var(--twx-border); border-radius: 8px;
        color: var(--twx-fg-subtle); font-size: 11px; text-align: center;
    }

    /* ── Scratchpad (fills the remaining height, inset from the panel bottom) ── */
    .twx-scratchpad { display: flex; min-height: 0; flex: 1; }
    .twx-scratchpad textarea {
        width: 100%; height: 100%; min-height: 0;
        padding: 12px; resize: none;
        border: 1px solid var(--twx-border-strong); border-radius: 8px;
        color: var(--twx-fg-emphasis); background: var(--twx-sidebar-bg, var(--twx-bg-deep));
        font: 13px/1.65 "JetBrains Mono", Consolas, monospace;
        tab-size: 4;
    }

    /* ── Buttons / status ── */
    .twx-btn {
        min-height: 29px; padding: 4px 9px;
        border: 1px solid var(--twx-border); border-radius: 6px;
        color: var(--twx-fg); background: var(--twx-bg-raised); cursor: pointer;
        font-size: 11px; font-family: inherit;
    }
    .twx-btn.is-primary {
        color: var(--twx-success-fg); border-color: var(--twx-success);
        background: var(--twx-success); font-weight: 700;
    }
    .twx-btn.is-danger {
        color: var(--twx-danger-fg);
        border-color: color-mix(in srgb, var(--twx-danger) 55%, transparent);
        background: var(--twx-danger-bg);
    }
    .twx-icon-btn { min-width: 29px; padding: 3px 7px; font-size: 14px; line-height: 1; }
    .twx-root button:hover { filter: brightness(1.14); }
    .twx-root button:focus-visible, .twx-root input:focus-visible,
    .twx-root textarea:focus-visible, .twx-root select:focus-visible {
        outline: 2px solid var(--twx-accent); outline-offset: 2px;
    }
    .twx-status {
        position: absolute; right: 12px; bottom: 12px; z-index: 2;
        padding: 8px 11px; border-radius: 7px; opacity: 0; pointer-events: none;
        color: var(--twx-status-ok-fg); background: var(--twx-status-ok-bg);
        transform: translateY(8px);
        transition: opacity .15s ease, transform .15s ease; font-size: 11px;
    }
    .twx-status.is-visible { opacity: 1; transform: translateY(0); }
    .twx-status.is-error { color: var(--twx-status-error-fg); background: var(--twx-status-error-bg); }

    /* ── Right-click context menu (quick-grid management), on document.body ── */
    .twx-context-menu {
        position: fixed; z-index: 10020; display: flex; min-width: 150px; padding: 5px;
        flex-direction: column; gap: 2px;
        border: 1px solid var(--twx-border-strong); border-radius: 8px;
        color: var(--twx-fg); background: var(--twx-bg);
        box-shadow: var(--twx-shadow-menu); -webkit-app-region: no-drag;
        font-family: Inter, "Segoe UI", sans-serif;
    }
    .twx-context-menu button {
        min-height: 32px; padding: 6px 10px; border: 0; border-radius: 5px;
        color: var(--twx-fg); background: transparent; cursor: pointer; text-align: left;
        font-size: 12.5px; line-height: 1.3; font-family: inherit;
    }
    .twx-context-menu button:hover,
    .twx-context-menu button:focus-visible { background: var(--twx-bg-hover); outline: none; }
    .twx-context-menu button.is-danger { color: var(--twx-danger-fg); }
    .twx-context-menu button.is-danger:hover { background: var(--twx-danger-bg); }

    /* ── Quick-search palette, hosted on document.body ── */
    twx-palette-modal { display: block; }
    .twx-palette { width: min(460px, calc(100vw - 32px)); }
    .twx-palette-input-wrap {
        display: flex; align-items: center; gap: 9px; padding: 10px 14px;
        border-bottom: 1px solid var(--twx-border);
        color: var(--twx-fg-muted);
    }
    .twx-palette-input-wrap input {
        flex: 1; min-width: 0; padding: 2px 0; border: 0; outline: none;
        color: var(--twx-fg-emphasis); background: transparent;
        font-size: 13.5px; font-family: inherit;
    }
    .twx-palette-input-wrap input::placeholder { color: var(--twx-fg-subtle); }
    .twx-palette-list {
        max-height: min(340px, calc(100vh - 220px)); overflow-y: auto; padding: 6px;
    }
    .twx-palette-item {
        display: flex; min-height: 34px; align-items: center; gap: 8px;
        padding: 5px 9px; border-radius: 6px; cursor: pointer;
    }
    .twx-palette-item.is-selected { background: var(--twx-bg-hover); }
    .twx-palette-mode {
        flex: 0 0 auto; padding: 1px 6px; border-radius: 999px;
        color: var(--twx-fg-muted); background: var(--twx-bg-raised);
        font-size: 10px; line-height: 1.6;
    }
    /* Scene header row (grouped mode), settings-page tree style */
    .twx-palette-group {
        display: flex; align-items: center; gap: 7px;
        padding: 8px 9px 3px; color: var(--twx-fg-muted);
        font-size: 11px; font-weight: 600;
    }
    .twx-palette-group .twx-scene-icon { font-size: .9rem; }
    .twx-palette-group-name {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .twx-palette-group-count { flex: 0 0 auto; color: var(--twx-fg-subtle); font-weight: 400; }
    .twx-palette-item.is-grouped { margin-left: 1.375rem; }
    .twx-palette-name {
        flex: 0 1 auto; overflow: hidden;
        color: var(--twx-fg-emphasis); font-size: 12.5px; font-weight: 600;
        text-overflow: ellipsis; white-space: nowrap;
    }
    .twx-palette-scene { flex: 0 0 auto; color: var(--twx-fg-subtle); font-size: 10.5px; }
    .twx-palette-preview {
        flex: 1 1 auto; overflow: hidden; min-width: 0;
        color: var(--twx-fg-muted); font-size: 11px;
        font-family: "JetBrains Mono", Consolas, monospace;
        text-overflow: ellipsis; white-space: nowrap; text-align: right;
    }
    .twx-palette-empty {
        padding: 18px; color: var(--twx-fg-subtle); font-size: 12px; text-align: center;
    }
    .twx-palette-hint {
        padding: 7px 14px; border-top: 1px solid var(--twx-border);
        color: var(--twx-fg-subtle); font-size: 10.5px;
    }

    /* ── Modals (params / confirm / button edit), hosted on document.body ── */
    .twx-modal-backdrop {
        position: fixed; inset: 0; z-index: 10030; display: grid; padding: 24px;
        place-items: center; background: rgba(0, 0, 0, .45);
        backdrop-filter: blur(3px); -webkit-app-region: no-drag;
    }
    .twx-modal {
        display: flex; width: min(520px, calc(100vw - 32px));
        max-height: min(720px, calc(100vh - 32px));
        flex-direction: column; overflow: hidden;
        border: 1px solid var(--twx-border-strong); border-radius: 12px;
        color: var(--twx-fg); background: var(--twx-bg);
        box-shadow: var(--twx-shadow-lg);
        font-family: Inter, "Segoe UI", sans-serif;
    }
    .twx-modal--confirm { width: min(380px, calc(100vw - 32px)); }
    .twx-modal-header {
        display: flex; padding: 12px 14px; align-items: center; justify-content: space-between;
        border-bottom: 1px solid var(--twx-border);
    }
    .twx-modal-header strong { font-size: 15px; }
    .twx-modal-body { overflow-y: auto; padding: 14px; }
    .twx-modal-message { margin: 0; color: var(--twx-fg); font-size: 13px; line-height: 1.55; }
    .twx-modal .twx-field { display: flex; min-width: 0; flex-direction: column; gap: 4px; font-size: 10px; }
    .twx-modal .twx-field + .twx-field { margin-top: 8px; }
    .twx-modal .twx-field input {
        width: 100%; min-height: 32px; padding: 6px 8px;
        border: 1px solid var(--twx-border-strong); border-radius: 6px;
        color: var(--twx-fg-emphasis); background: var(--twx-bg-deep); font: inherit; font-size: 13px;
    }
    /* File drop zone inside the collect modal ({{file}} blocks) */
    .twx-file-drop {
        display: flex; min-height: 46px; align-items: center; gap: 9px;
        margin-top: 8px; padding: 6px 11px;
        border: 1px dashed var(--twx-border-strong); border-radius: 6px;
        color: var(--twx-fg-muted); cursor: pointer; font-size: 12.5px;
        transition: border-color .12s ease, color .12s ease;
    }
    .twx-file-drop:hover, .twx-file-drop.is-hover {
        border-color: var(--twx-accent); color: var(--twx-fg);
    }
    .twx-file-drop.is-filled { border-style: solid; color: var(--twx-fg-emphasis); }
    .twx-file-drop.is-filled .fa-file { color: var(--twx-accent); }
    .twx-file-name { flex: 0 1 auto; overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .twx-file-path {
        flex: 1 1 auto; overflow: hidden; min-width: 0;
        color: var(--twx-fg-subtle); font-size: 11px;
        text-overflow: ellipsis; white-space: nowrap; text-align: right;
    }
    .twx-modal .twx-actions {
        display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; margin-top: 12px;
    }
    .twx-modal .twx-btn { min-height: 34px; padding-inline: 13px; font-size: 12px; }

    /* ── Settings page (profiles-page-like tree) ── */
    .twx-settings .hint {
        margin: 0; color: var(--twx-fg-muted); font-size: 12px; line-height: 1.5;
    }
    /* Same recipe as tabby-settings' collapse-container / collapse-item
     * (component-scoped there, so replicated here against twx tokens). */
    .twx-collapse-container { border-radius: 0.375rem; }
    .twx-collapse-item {
        height: 2.25rem; border-radius: 0.3rem; cursor: pointer;
    }
    .twx-collapse-item:hover { background: color-mix(in srgb, var(--twx-fg) 6%, transparent); }
    /* Scene colour painted straight onto the configured icon glyph
     * (profileIcon-style), no separate dot. */
    .twx-scene-icon { flex: 0 0 auto; font-size: 1rem; }
    /* Scene icon picker (settings modal) */
    .twx-icon-input { display: flex; align-items: center; gap: 8px; }
    .twx-icon-input input { flex: 1; }
    .twx-icon-input > i { flex: 0 0 auto; color: var(--twx-fg-muted); }
    .twx-icon-presets {
        display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding-top: 8px;
        border-top: 1px solid var(--twx-border-dim);
    }
    .twx-icon-preset {
        display: inline-flex; width: 30px; height: 30px; align-items: center; justify-content: center;
        padding: 0; border: 1px solid var(--twx-border); border-radius: 6px;
        color: var(--twx-fg-muted); background: var(--twx-bg-raised); cursor: pointer;
        font-size: 13px;
    }
    .twx-icon-preset:hover { filter: brightness(1.18); }
    .twx-icon-preset.is-selected { border-color: var(--twx-accent); color: var(--twx-accent); }
    .twx-item-preview {
        max-width: 40%; overflow: hidden; text-overflow: ellipsis;
    }
    /* Drag-sort affordance on settings-page button rows */
    .twx-item { cursor: grab; }
    .twx-item.is-dragging {
        z-index: 1; cursor: grabbing;
        background: var(--twx-bg-raised);
        box-shadow: var(--twx-shadow-sm);
    }
    .twx-item.is-dragging * { cursor: grabbing !important; }
    .twx-row-btn {
        min-width: 30px; min-height: 30px; padding: 2px 8px;
        border: 1px solid var(--twx-border); border-radius: 6px;
        color: var(--twx-fg); background: var(--twx-bg-raised); cursor: pointer;
        font-size: 12px; line-height: 1.4;
    }
    .twx-row-btn:disabled { opacity: .4; cursor: default; }
    .twx-btn-editor {
        padding: 12px; border: 1px solid var(--twx-border); border-radius: 8px;
        background: color-mix(in srgb, var(--twx-bg-raised) 55%, transparent);
    }
    .twx-btn-editor .twx-field { display: flex; min-width: 0; flex-direction: column; gap: 4px; font-size: 12px; }
    .twx-btn-editor .twx-field + .twx-field,
    .twx-btn-editor .twx-checkbox,
    .twx-btn-editor .twx-template-tools { margin-top: 10px; }
    .twx-btn-editor .twx-field input,
    .twx-btn-editor .twx-field textarea,
    .twx-btn-editor .twx-field select {
        width: 100%; min-height: 32px; padding: 6px 8px;
        border: 1px solid var(--twx-border-strong); border-radius: 6px;
        color: var(--twx-fg-emphasis); background: var(--twx-bg-deep);
    }
    /* ── Colour swatches field (snippet / scene editors) ── */
    .twx-swatches { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 2px 0; }
    .twx-swatch {
        width: 24px; height: 24px; padding: 0; flex: 0 0 auto;
        border: 1px solid var(--twx-border-strong); border-radius: 6px;
        cursor: pointer; background: var(--twx-bg-raised);
    }
    .twx-swatch:hover { filter: brightness(1.18); }
    .twx-swatch.is-selected { outline: 2px solid var(--twx-accent); outline-offset: 2px; }
    .twx-swatch.is-custom {
        display: inline-flex; align-items: center; justify-content: center;
        color: var(--twx-fg-muted); font-size: 11px;
    }
    .twx-swatch.is-custom.is-selected { color: var(--twx-accent); }
    /* Must beat the generic .twx-modal .twx-field input sizing rules. */
    .twx-color-native {
        position: absolute; width: 0 !important; height: 0 !important;
        min-height: 0 !important; padding: 0 !important; border: 0 !important;
        opacity: 0; pointer-events: none;
    }
    .twx-btn-editor .twx-field textarea {
        min-height: 92px; resize: vertical;
        font: 12px/1.5 "JetBrains Mono", Consolas, monospace;
    }
    .twx-checkbox { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .twx-template-tools { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .twx-template-hint { flex: 1 0 100%; color: var(--twx-fg-muted); font-size: 11px; line-height: 1.45; }
    .twx-editor-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 12px; }

    /* ── Responsive ── */
    @container (max-width: 350px) {
        .twx-quick-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-height: 680px) {
        .twx-header { padding-block: 4px; }
        .twx-scene-tabs { padding-top: 5px; }
        .twx-section--quick { margin-bottom: 8px; }
        .twx-section-header { margin-bottom: 5px; }
    }
`
