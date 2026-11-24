/*
 * Feinwerk top bar fit, version 1. The same file in Feinwerk Dashboard Segment and Feinwerk Dashboard Sharing (copy it
 * byte-identical, like the Feinwerk kit files).
 *
 * Peter, 2026-11-24 (P4 B): the labels of these plugins' buttons in Matomo's top bar (website, date, segment) give way
 * when the bar would otherwise need another row; the buttons then show their icon (and Dashboard Segment its name), the
 * label stays for screen readers and in the tooltip (each plugin's CSS and markup).
 *
 * Each plugin registers its buttons: window.fwTopBar.register({ el: Element, order: Number, set: function (on) {} }).
 * The fit makes compact the fewest of them, in their order, that bring the bar to the fewest rows it can have, and none
 * when that saves no row or below 600 px, where Matomo stacks the controls in a column. It runs again on resize, on
 * changes inside the bar and when a plugin calls window.fwTopBar.schedule(). A newer copy replaces the functions of an
 * older one and keeps its registrations; an equal or older copy leaves the page to the one that runs.
 */
(function () {
    'use strict';
    var VERSION = 1;
    var current = window.fwTopBar;
    if (current && current.v >= VERSION) { return; }

    var api = current || { items: [] };
    var timer = null;
    var observed = null;
    var resizing = false;

    function bar() {
        return document.querySelector('.top_controls');
    }

    function attached(item) {
        return !!(item && item.el && document.documentElement.contains(item.el));
    }

    // Rows of the bar: its flex items (the children of display:contents slots count themselves), grouped by top/bottom.
    function rows(top) {
        var rects = [];
        Array.prototype.forEach.call(top.children, function (child) {
            var items = window.getComputedStyle(child).display === 'contents' ? Array.prototype.slice.call(child.children) : [child];
            items.forEach(function (el) {
                var r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) { rects.push(r); }
            });
        });
        rects.sort(function (a, b) { return a.top - b.top; });
        var count = 0;
        var bottom = -Infinity;
        rects.forEach(function (r) {
            if (r.top >= bottom - 2) { count++; bottom = r.bottom; } else { bottom = Math.max(bottom, r.bottom); }
        });
        return count;
    }

    api.v = VERSION;

    api.fit = function () {
        try {
            var top = bar();
            var items = api.items.filter(attached).sort(function (a, b) { return a.order - b.order; });
            if (!top || !items.length) { return; }
            var apply = function (k) { items.forEach(function (item, i) { item.set(i < k); }); };
            var choice = 0;
            if (window.innerWidth >= 600) {
                apply(0);
                var none = rows(top);
                apply(items.length);
                var all = rows(top);
                if (all < none) {
                    choice = items.length;
                    for (var k = 1; k < items.length; k++) {
                        apply(k);
                        if (rows(top) <= all) { choice = k; break; }
                    }
                }
            }
            apply(choice);
        } catch (e) {
            // the buttons keep what they show
        }
    };

    api.schedule = function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(function () { (window.fwTopBar || api).fit(); }, 60);
    };

    api.register = function (item) {
        api.items = api.items.filter(function (it) { return it.el !== item.el && attached(it); });
        api.items.push(item);
        api.watch();
        api.schedule();
    };

    api.watch = function () {
        if (!resizing) {
            resizing = true;
            window.addEventListener('resize', function () { (window.fwTopBar || api).schedule(); });
        }
        var top = bar();
        if (top && observed !== top && typeof window.MutationObserver === 'function') {
            observed = top;
            new window.MutationObserver(function () { (window.fwTopBar || api).schedule(); })
                .observe(top, { childList: true, subtree: true, characterData: true });
        }
    };

    window.fwTopBar = api;
})();
