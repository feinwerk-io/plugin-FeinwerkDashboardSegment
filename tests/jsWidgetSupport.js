/**
 * Which widgets get the segment and time range buttons (run: `node tests/jsWidgetSupport.js` from the plugin dir).
 *
 * Only Matomo reports the server renders from the widget's own request (a report table, `.dataTable[data-report]`)
 * can take a segment or time range of their own. Widgets that load their data in the browser, such as those of
 * Feinwerk Live Dashboard, follow the dashboard's segment and get no buttons. A widget that already has an override
 * keeps its buttons, so the override can be removed.
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
global.window = {};
window.console = console;
window.$ = $; window.jQuery = $;
window.broadcast = { getValueFromHash: function () { return ''; }, getValueFromUrl: function () { return ''; } };
window.piwik = { idSite: 3, token_auth: 't', userLogin: 'tester', on: function () {} };
window.ajaxHelper = function () {
    return { addParams: function () {}, withTokenInUrl: function () {}, setFormat: function () {}, setErrorCallback: function () {},
        send: function () { return Promise.resolve([]); } };
};
window.widgetsHelper = { loadWidgetAjax: function () { return {}; } };
global._pk_translate = function (k) { return k; };
window.setTimeout = function (fn) { return setTimeout(fn, 0); };
window.clearTimeout = function (t) { return clearTimeout(t); };
window.MutationObserver = function () { return { observe: function () {} }; };
global.document = { createTextNode: function () { return {}; }, getElementById: function () { return {}; } };

require('../javascripts/dashboardSegment.js');
var DS = window.FeinwerkDashboardSegment;

// a widget as Matomo's dashboard hands it over at widget:create: its parameters and its rendered content
function widget(uniqueId, params, selectors) {
    var found = selectors || [];
    return {
        uniqueId: uniqueId,
        widgetParameters: params,
        element: { find: function (sel) { return { length: found.indexOf(sel) !== -1 ? 1 : 0 }; } },
    };
}
var REPORT = '.dataTable[data-report]';
var failures = [];
function expect(w, offered, what) {
    if (DS.offersOverrides(w) !== offered) { failures.push(what + ' must ' + (offered ? '' : 'not ') + 'get the buttons'); }
}
DS.settings = { widgets: {}, defaultAction: null };

expect(widget('widgetReferrersgetReferrerType', { module: 'Referrers', action: 'getReferrerType' }, [REPORT]),
    true, 'a report table (Channel Types)');
expect(widget('widgetFeinwerkLiveDashboardgetLiveBoard', { module: 'FeinwerkLiveDashboard', action: 'getLiveBoard' }, []),
    false, 'a widget that loads its data in the browser (Feinwerk Live Dashboard)');
expect(widget('widgetSomePlugingetCustom', { module: 'SomePlugin', action: 'getCustom' }, []),
    false, 'a widget of another plugin without a report table');
expect(widget('widgetVisitsSummarygetEvolutionGraphforceView1viewDataTablegraphEvolution', { module: 'VisitsSummary', action: 'getEvolutionGraph', viewDataTable: 'graphEvolution' }, [REPORT]),
    false, 'an evolution graph');
expect(widget('widgetLivewidget', { module: 'Live', action: 'widget' }, []), false, 'the Real-time widget');
expect(widget('widgetCoreHomegetVisitsOverviewWithGraph', { module: 'CoreHome', action: 'renderWidgetContainer' }, [REPORT]),
    false, 'a container widget');

// an override stored for a widget keeps its buttons, also when its content shows no report (a failed request)
DS.settings = { widgets: { i1: { segment: { action: 'remove' }, period: null } }, defaultAction: null };
expect(widget('widgetSomePlugingetCustom', { module: 'SomePlugin', action: 'getCustom', dsSegId: 'i1' }, []),
    true, 'a widget with an override of its own');
DS.settings = { widgets: { i2: { segment: null, period: { period: 'range', date: 'last30' } } }, defaultAction: null };
expect(widget('widgetReferrersgetReferrerType', { module: 'Referrers', action: 'getReferrerType', dsSegId: 'i2' }, []),
    true, 'a widget with a time range of its own');

if (failures.length) {
    failures.forEach(function (f) { console.error('FAIL: ' + f); });
    process.exit(1);
}
console.log('WIDGET-SUPPORT OK: buttons only on report tables and on widgets with an override of their own');
