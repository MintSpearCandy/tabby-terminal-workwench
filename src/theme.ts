/**
 * Plugin-level design tokens mapped to Tabby theme CSS variables.
 *
 * Every token carries a fallback matching the current dark-theme value for
 * compatibility with older Tabby versions.  Global and component styles must
 * only reference `--twx-*` tokens, never raw colours or `--theme-*`
 * variables directly.
 *
 * Tabby's theme scale (dark → light):
 *   bg:  less-2 (deepest) → less → base → more → more-2 (lightest)
 *   fg:  more-2 (highest contrast) → more → base → less → less-2 (lowest)
 */

export const THEME_TOKENS = `
    body {
        /* ── Background scale (deepest → lightest) ── */
        --twx-bg-deep:    var(--theme-bg-less-2,  #0b1424);
        --twx-bg:         var(--theme-bg-less,     #111b2c);
        --twx-bg-mid:     var(--theme-bg,          #172033);
        --twx-bg-raised:  var(--theme-bg-more,     #1b2940);
        --twx-bg-hover:   var(--theme-bg-more-2,   #24334d);

        /* ── Foreground scale (highest contrast → lowest) ── */
        --twx-fg-emphasis:  var(--theme-fg-more,     #f8fafc);
        --twx-fg:           var(--theme-fg,           #e5e7eb);
        --twx-fg-muted:     var(--theme-fg-less,      #94a3b8);
        --twx-fg-subtle:    var(--theme-fg-less-2,    #64748b);

        /* ── Semantic accents ── */
        --twx-accent:       var(--theme-primary,   #38bdf8);
        --twx-accent-fg:    var(--theme-primary-fg, #052e16);
        --twx-success:      var(--theme-success,    #22c55e);
        --twx-success-fg:   var(--theme-success-fg, #052e16);
        --twx-danger:       var(--theme-danger,     #ef4444);
        --twx-danger-fg:    #f87171;
        --twx-warning:      var(--theme-warning,    #f59e0b);
        --twx-warning-fg:   var(--theme-warning-fg, #fef3c7);
        --twx-info:         var(--theme-info,       #0ea5e9);

        /* ── Borders ── */
        --twx-border-dim:    color-mix(in srgb, var(--twx-fg-muted) 16%, transparent);
        --twx-border:        color-mix(in srgb, var(--twx-fg-muted) 22%, transparent);
        --twx-border-strong: color-mix(in srgb, var(--twx-fg-muted) 28%, transparent);

        /* ── Shadows ── */
        --twx-shadow-sm:   0 14px 30px rgba(0, 0, 0, .28);
        --twx-shadow-lg:   0 24px 80px rgba(0, 0, 0, .62);
        --twx-shadow-menu: 0 16px 40px rgba(0, 0, 0, .52);

        /* ── Misc ── */
        /* Mirrors Tabby's global *::-webkit-scrollbar (theme.new.scss) */
        --twx-scrollbar-track:  rgba(0, 0, 0, .125);
        --twx-scrollbar-thumb:  rgba(255, 255, 255, .25);
        --twx-danger-bg:        rgba(127, 29, 29, .55);
        --twx-danger-hover-bg:  rgba(127, 29, 29, .55);
        --twx-status-ok-bg:    #166534;
        --twx-status-ok-fg:    #dcfce7;
        --twx-status-error-bg: #991b1b;
        --twx-status-error-fg: #fee2e2;
    }
`
