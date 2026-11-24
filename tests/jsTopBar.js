/**
 * javascripts/fwtopbar.js (run: `node tests/jsTopBar.js` from the plugin dir): Peter, 2026-11-24 (P4 B, B2). The labels
 * of the Feinwerk buttons in Matomo's top bar give way only when the bar would otherwise need another row, the fewest
 * steps in their order (Dashboard Segment's short label, Dashboard Sharing's labels, Dashboard Segment's label gone),
 * also when only several together save the row, and never below 600 px.
 *
 * A small flex-wrap layout stands in for the browser: items flow left to right with an 8 px gap and wrap at the bar's
 * width; each registered button has a full and a compact width.
 */
process.on('uncaughtException', function (e) { console.error('UNCAUGHT:', e); process.exit(1); });

var BAR_WIDTH = 1000;
var GAP = 8;
var children = [];
function item(width, compactWidth, shortWidth) {
    var el = { width: width, compactWidth: compactWidth || width, shortWidth: shortWidth || width, compact: false, short: false };
    el.getBoundingClientRect = function () { return layout().get(el); };
    children.push(el);
    return el;
}
function widthOf(el) {
    return el.compact ? el.compactWidth : (el.short ? el.shortWidth : el.width);
}
function layout() {
    var map = new Map();
    var x = 0;
    var top = 0;
    children.forEach(function (el) {
        var w = widthOf(el);
        if (x > 0 && x + w > BAR_WIDTH) { x = 0; top += 46; }
        map.set(el, { top: top, bottom: top + 38, width: w, height: 38 });
        x += w + GAP;
    });
    return map;
}
var bar = { children: children };
global.window = {
    innerWidth: 1400,
    getComputedStyle: function () { return { display: 'block' }; },
    setTimeout: function (fn) { fn(); return 0; },
    clearTimeout: function () {},
    addEventListener: function () {},
};
global.document = {
    documentElement: { contains: function () { return true; } },
    querySelector: function (sel) { return sel === '.top_controls' ? bar : null; },
};

require('../javascripts/fwtopbar.js');
var fw = window.fwTopBar;
var failures = [];
function check(ok, what) { if (!ok) { failures.push(what); } }
function rowsNow() { var seen = {}; children.forEach(function (el) { seen[el.getBoundingClientRect().top] = true; }); return Object.keys(seen).length; }

// Matomo's own controls (website, date, segment selector, Manage Dashboard), then Dashboard Segment, then Sharing's two
item(180); item(150); item(170);
// "[icon] Dashboard segment: <name>" / "[icon] Default: <name>" / "[icon] <name>"
var segment = item(330, 180, 250);
var segmentLabel = {};             // the label element, a second registration of the same button
item(160);
var share = item(90, 40);
var importBtn = item(110, 40);
fw.register({ el: segment, order: 10, set: function (on) { segment.short = on; } });
fw.register({ el: share, order: 20, set: function (on) { share.compact = on; importBtn.compact = on; } });
fw.register({ el: segmentLabel, order: 30, set: function (on) { segment.compact = on; } });

function state() {
    return (segment.compact ? 'C' : (segment.short ? 'S' : '-')) + (share.compact ? 'H' : '-') + ' rows ' + rowsNow();
}

// full: 180+150+170+330+160+90+110 + 6 gaps = 1238; short label 1158; plus Sharing 1038; no label 968
BAR_WIDTH = 1300; fw.fit();
check(state() === '-- rows 1', 'room enough: nothing changes, got ' + state());
BAR_WIDTH = 1200; fw.fit();
check(state() === 'S- rows 1', 'the short label alone saves the row: only it, got ' + state());
BAR_WIDTH = 1100; fw.fit();
check(state() === 'SH rows 1', 'short label and Sharing together save the row, got ' + state());
BAR_WIDTH = 1000; fw.fit();
check(state() === 'CH rows 1', 'only all three steps save the row: the label goes last, got ' + state());
BAR_WIDTH = 700; fw.fit();
var narrow = state();
check(/^-- /.test(narrow) || rowsNow() < 3, 'compact only where it saves a row, got ' + narrow);
window.innerWidth = 500; BAR_WIDTH = 1000; fw.fit();
check(state().indexOf('--') === 0, 'below 600 px nothing changes, got ' + state());
window.innerWidth = 1400;

// an older copy loaded later leaves the page to the one that runs; a newer one keeps the registrations
var running = window.fwTopBar;
delete require.cache[require.resolve('../javascripts/fwtopbar.js')];
require('../javascripts/fwtopbar.js');
check(window.fwTopBar === running && running.items.length === 3, 'an equal copy leaves the running one alone');
running.v = 0;
delete require.cache[require.resolve('../javascripts/fwtopbar.js')];
require('../javascripts/fwtopbar.js');
check(window.fwTopBar.v === 1 && window.fwTopBar.items.length === 3, 'a newer copy keeps the registered buttons');

// a failing button never breaks the page
fw.register({ el: item(50), order: 30, set: function () { throw new Error('broken'); } });
var threw = false;
try { window.fwTopBar.fit(); } catch (e) { threw = true; }
check(!threw, 'an error inside the fit stays inside');

if (failures.length) {
    failures.forEach(function (f) { console.error('FAIL: ' + f); });
    process.exit(1);
}
console.log('TOP-BAR OK: labels give way only where they cost a row, in order, together when needed, never below 600 px');
