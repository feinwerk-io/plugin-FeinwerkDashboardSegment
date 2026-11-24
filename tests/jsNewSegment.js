/**
 * "New segment" from a menu (run: `node tests/jsNewSegment.js` from the plugin dir): Peter, 2026-11-24 (B1). The segment
 * saved in Matomo's editor goes to the widget (or the dashboard default) whose menu opened the editor, and the segment
 * at the top goes back to what it was. Matomo reloads the page after saving (addSegmentAsNew in the hash); a note in
 * sessionStorage carries the target across that reload, read once, 15 minutes at most.
 */
process.on('unhandledRejection', function (e) { console.error('UNHANDLED REJECTION:', e); process.exit(1); });
process.on('uncaughtException', function (e) { console.error('UNCAUGHT:', e); process.exit(1); });

function jq() {
    var o = function () { return o; };
    ['find', 'first', 'each', 'on', 'one', 'attr', 'append', 'prepend', 'after', 'before', 'next', 'remove', 'text',
        'addClass', 'hide', 'show', 'empty', 'css', 'dashboardWidget', 'dashboard', 'data', 'trigger', 'map', 'filter',
        'val', 'prop', 'is', 'toggleClass'].forEach(function (m) { o[m] = function () { return o; }; });
    o.length = 0;
    o.attr = function (name, value) { return arguments.length > 1 ? o : ''; };
    o.val = function () { return ''; };
    o.is = function () { return false; };
    o.hasClass = function () { return false; };
    o.dashboard = function () { return ''; };
    return o;
}
var $ = function (arg) { if (typeof arg === 'function') { arg(); return; } return jq(); };
$.extend = Object.assign;
$.Deferred = function () {
    var d = { resolve: function () { return d; }, reject: function () { return d; }, promise: function () { return Promise.resolve(false); } };
    return d;
};

var store = {};
var saved = [];        // the plugin's save requests: [action, get params, post params]
var hashCalls = [];    // segments the plugin put at the top
var settings = { widgets: {}, defaultAction: null };
global.window = {};
window.console = console;
window.$ = $; window.jQuery = $;
window.sessionStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
};
window.location = { hash: '' };
window.broadcast = {
    getValueFromHash: function (k) { return ({ category: 'Dashboard_Dashboard', subcategory: '5', idSite: '3' })[k] || ''; },
    getValueFromUrl: function () { return ''; },
};
window.CoreHome = { MatomoUrl: {
    hashParsed: { value: { segment: '' } },
    updateHash: function (params) { hashCalls.push(params.segment); window.CoreHome.MatomoUrl.hashParsed.value = params; },
} };
window.piwik = { idSite: 3, token_auth: 't', userLogin: 'tester', on: function () {} };
window.ajaxHelper = function () {
    var get = {}; var post = {};
    return {
        addParams: function (p, where) { Object.assign(where === 'get' ? get : post, p); },
        withTokenInUrl: function () {}, setFormat: function () {}, setErrorCallback: function () {},
        send: function () {
            if (get.action === 'getSettings') { return Promise.resolve(JSON.parse(JSON.stringify(settings))); }
            if (get.action === 'getSegments') {
                return Promise.resolve([{ definition: 'deviceType==smartphone', name: 'Mobile visitors' },
                    { definition: 'pageUrl%3D%40%252Fshop', name: 'Shop' }]);
            }
            saved.push([get.action, get, post]);
            return Promise.resolve([]);
        },
    };
};
window.widgetsHelper = { loadWidgetAjax: function () { return {}; } };
global._pk_translate = function (k) { return k; };
window.setTimeout = function (fn, ms) { return setTimeout(fn, ms || 0); };
window.clearTimeout = function (t) { return clearTimeout(t); };
window.setInterval = function (fn, ms) { return setInterval(fn, ms); };
window.clearInterval = function (t) { return clearInterval(t); };
var unloadListeners = [];
window.addEventListener = function (name, fn) { if (name === 'beforeunload') { unloadListeners.push(fn); } };
var editorOpen = false; // Matomo's segment editor on the page
var plain$ = window.$;
window.$ = function (arg) { return arg === '.segment-element:visible' ? { length: editorOpen ? 1 : 0 } : plain$(arg); };
window.$.extend = Object.assign; window.$.Deferred = plain$.Deferred;
window.MutationObserver = function () { return { observe: function () {} }; };
global.document = { createTextNode: function () { return {}; }, getElementById: function () { return {}; } };

require('../javascripts/dashboardSegment.js');
var DS = window.FeinwerkDashboardSegment;
var failures = [];
function check(ok, what) { if (!ok) { failures.push(what); } }
function note(target, before, extra) {
    store.fwdsNewSegmentFor = JSON.stringify(Object.assign({ idSite: '3', idDashboard: '5', target: target, before: before,
        baseline: null, at: Date.now() }, extra || {}));
}
// the page after Matomo's editor saved "deviceType==smartphone"
function afterSave(segment) {
    window.location.hash = '#?idSite=3&category=Dashboard_Dashboard&subcategory=5&addSegmentAsNew=&segment=' + segment;
    window.CoreHome.MatomoUrl.hashParsed.value = { segment: segment };
}
function run() {
    return new Promise(function (resolve) {
        DS.idDashboard = 5;
        DS.settings = { widgets: {}, defaultAction: settings.defaultAction };
        DS.baselineSegment = null; DS.appliedSegment = null;
        saved = []; hashCalls = [];
        DS.applyNewSegmentNote(function () { setTimeout(resolve, 20); });
    });
}

Promise.resolve()
    // 1. a widget's "New segment", dashboard without default: the widget gets it, the top goes back to all visits
    .then(function () { note('iwidget1', ''); afterSave('deviceType==smartphone'); return run(); })
    .then(function () {
        var s = saved[0] || [];
        check(s[0] === 'saveWidgetSegment' && s[1].widgetUniqueId === 'iwidget1' && s[2].segmentValue === 'deviceType==smartphone',
            'the widget gets the new segment, got ' + JSON.stringify(saved));
        check(DS.appliedSegment === 'deviceType==smartphone' && DS.baselineSegment === '',
            'the top goes back to what it was (restored on entry), got ' + JSON.stringify([DS.appliedSegment, DS.baselineSegment]));
        check(store.fwdsNewSegmentFor === undefined, 'the note is read once');
        var restoring = DS.restoreBaselineSegment();
        window.widgetsHelper.loadWidgetAjax('w', {}, function () {}, function () {}); // the dashboard has rendered
        return new Promise(function (r) { setTimeout(r, 20); }).then(function () {
            check(restoring === true && hashCalls[hashCalls.length - 1] === '', 'the restore puts all visits back at the top, got ' + JSON.stringify(hashCalls));
        });
    })
    // 2. the default's "New segment": the default gets it, the top keeps it, the user's own segment stays the baseline
    .then(function () { note('default', 'visitorType==returning', { baseline: 'visitorType==new' }); afterSave('deviceType==smartphone'); return run(); })
    .then(function () {
        var s = saved[0] || [];
        check(s[0] === 'saveDashboardDefault' && s[2].segmentValue === 'deviceType==smartphone', 'the default gets the new segment, got ' + JSON.stringify(saved));
        check(DS.baselineSegment === 'visitorType==new', 'the user\'s own segment stays the one to come back to, got ' + DS.baselineSegment);
    })
    // 3. the saved definition is used where the URL holds it decoded
    .then(function () { note('iwidget2', ''); afterSave('pageUrl=@%2Fshop'); return run(); })
    .then(function () {
        var s = saved[0] || [];
        check(s[2] && s[2].segmentValue === 'pageUrl%3D%40%252Fshop', 'the stored definition of the saved segment, got ' + JSON.stringify(saved));
    })
    // 4. nothing happens without Matomo's save mark, for another dashboard, after 15 minutes, or with the same segment
    .then(function () { note('iwidget1', ''); window.location.hash = '#?segment=deviceType==smartphone'; return run(); })
    .then(function () { check(saved.length === 0 && store.fwdsNewSegmentFor === undefined, 'no save without the save mark of Matomo, note gone'); })
    .then(function () { note('iwidget1', '', { idDashboard: '6' }); afterSave('deviceType==smartphone'); return run(); })
    .then(function () { check(saved.length === 0, 'no save for another dashboard'); })
    .then(function () { note('iwidget1', '', { at: Date.now() - 16 * 60 * 1000 }); afterSave('deviceType==smartphone'); return run(); })
    .then(function () { check(saved.length === 0, 'no save after 15 minutes'); })
    .then(function () { note('iwidget1', 'deviceType==smartphone'); afterSave('deviceType==smartphone'); return run(); })
    .then(function () { check(saved.length === 0, 'no save when the top did not change'); })
    // 5. the editor opened by "New segment" closes without a save: the note goes, so a later save is not handed over
    .then(function () {
        store = {}; editorOpen = true;
        DS.startNewSegmentFor('iwidget1');
        check(!!store.fwdsNewSegmentFor, 'the note is written when "New segment" is clicked');
        return new Promise(function (r) { setTimeout(r, 900); });
    })
    .then(function () { editorOpen = false; return new Promise(function (r) { setTimeout(r, 2600); }); })
    .then(function () { check(store.fwdsNewSegmentFor === undefined, 'a closed editor drops the note'); })
    // 6. a save closes the editor and reloads the page: the note stays for the next page
    .then(function () {
        store = {}; editorOpen = true;
        DS.startNewSegmentFor('iwidget1');
        return new Promise(function (r) { setTimeout(r, 900); });
    })
    .then(function () {
        editorOpen = false;
        unloadListeners.forEach(function (fn) { fn(); });
        return new Promise(function (r) { setTimeout(r, 2600); });
    })
    .then(function () { check(!!store.fwdsNewSegmentFor, 'a save (the page unloads) keeps the note'); })
    .then(function () {
        if (failures.length) {
            failures.forEach(function (f) { console.error('FAIL: ' + f); });
            process.exit(1);
        }
        console.log('NEW-SEGMENT OK: a segment made with "New segment" goes to its widget or the default, once');
    });
