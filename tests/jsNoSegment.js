/**
 * "No segment (all data)" on a widget (run: `node tests/jsNoSegment.js` from the plugin dir).
 *
 * Matomo's ajaxHelper fills a missing or empty `segment` with the segment of the page (mixinDefaultGetParams). A widget
 * set to "No segment (all data)" on a dashboard whose segment is set (its default, or one chosen at the top) must still
 * load without a segment: on its first load and when its table reloads (sorting, paging), whose request Matomo builds
 * from the table's own parameters with empty values left out.
 *
 * The ajaxHelper below follows Matomo 5.0's rule (an empty segment is always filled in); Matomo 5.14 and 6 also keep a
 * segment that is set explicitly, which this stub ignores on purpose, so the test covers the oldest supported core.
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
    var d = { resolve: function () { return d; }, reject: function () { return d; }, promise: function () { return Promise.resolve([]); } };
    return d;
};

var PAGE_SEGMENT = 'deviceType==smartphone';   // the segment of the page (dashboard default or chosen at the top)

// Matomo 5.0's ajaxHelper, reduced to what decides the segment of a request
function AjaxHelper() {
    this.getParams = {};
    this.postParams = {};
    this.defaultParams = ['idSite', 'period', 'date', 'segment'];
}
AjaxHelper.prototype.addParams = function (params, type) {
    var target = String(type).toLowerCase() === 'get' ? this.getParams : this.postParams;
    Object.keys(params).forEach(function (k) { target[k] = params[k]; });
};
AjaxHelper.prototype.removeDefaultParameter = function (name) {
    this.defaultParams = this.defaultParams.filter(function (p) { return p !== name; });
};
AjaxHelper.prototype.mixinDefaultGetParams = function (params) {
    var defaults = { idSite: '3', period: 'day', segment: PAGE_SEGMENT };
    var self = this;
    Object.keys(defaults).forEach(function (key) {
        var empty = function (v) { return v === null || typeof v === 'undefined' || v === ''; };
        if (self.defaultParams.indexOf(key) !== -1 && empty(params[key]) && empty(self.postParams[key]) && defaults[key]) {
            params[key] = defaults[key];
        }
    });
    return params;
};
AjaxHelper.prototype.withTokenInUrl = function () {};
AjaxHelper.prototype.setFormat = function () {};
AjaxHelper.prototype.setErrorCallback = function () {};
AjaxHelper.prototype.setCallback = function () {};
AjaxHelper.prototype.send = function () { return Promise.resolve([]); };
// the GET parameters a request goes out with
function sentWith(getParams, postParams) {
    var a = new window.ajaxHelper();
    a.addParams(getParams, 'get');
    if (postParams) { a.addParams(postParams, 'post'); }
    return a.mixinDefaultGetParams(a.getParams);
}
var originalMixin = AjaxHelper.prototype.mixinDefaultGetParams;

global.window = {};
window.console = console;
window.$ = $; window.jQuery = $;
window.broadcast = { getValueFromHash: function () { return ''; }, getValueFromUrl: function () { return ''; } };
window.piwik = { idSite: 3, token_auth: 't', userLogin: 'tester', on: function () {} };
window.ajaxHelper = AjaxHelper;
// Matomo's widget loader: the widget's parameters go out as GET parameters of one request
var loaded = [];
window.widgetsHelper = { loadWidgetAjax: function (id, params) { loaded.push(sentWith(params)); return {}; } };
global._pk_translate = function (k) { return k; };
window.setTimeout = function (fn) { return setTimeout(fn, 0); };
window.clearTimeout = function (t) { return clearTimeout(t); };
window.MutationObserver = function () { return { observe: function () {} }; };
global.document = { createTextNode: function () { return {}; }, getElementById: function () { return {}; } };

require('../javascripts/dashboardSegment.js');

var DS = window.FeinwerkDashboardSegment;
var failures = [];
function check(ok, what) { if (!ok) { failures.push(what); } }
function segmentOf(p) { return Object.prototype.hasOwnProperty.call(p, 'segment') ? p.segment : '(none)'; }

DS.settings = {
    widgets: {
        all: { segment: { action: 'remove' } },
        own: { segment: { action: 'set', segment: 'browserCode==ff' } },
    },
    defaultAction: { action: 'set', segment: PAGE_SEGMENT },
};
// the dashboard copies the page's segment into every widget's parameters
function load(id) {
    window.widgetsHelper.loadWidgetAjax('widgetReferrersgetReferrerType', { module: 'Referrers', action: 'getReferrerType', dsSegId: id, segment: PAGE_SEGMENT }, function () {}, function () {});
    return loaded[loaded.length - 1];
}

// 1. first load
var all = load('all');
check(!all.segment, 'an "all data" widget must load without a segment, got ' + JSON.stringify(segmentOf(all)));
check(String(all.fwdsNoSegment) === '1', 'an "all data" widget must carry the marker its tables keep, got ' + JSON.stringify(all.fwdsNoSegment));
var inherit = load('other');
check(inherit.segment === PAGE_SEGMENT && !('fwdsNoSegment' in inherit), 'a widget without an override follows the dashboard default: ' + JSON.stringify(inherit));
var own = load('own');
check(own.segment === 'browserCode==ff' && !('fwdsNoSegment' in own), 'a widget with its own segment keeps it: ' + JSON.stringify(own));
check(!('dsSegId' in all), 'the instance id is not sent');

// 2. the widget's table reloads (sorting): Matomo copied the request's GET parameters into the table and leaves the
//    empty segment out of the new request
var sorted = sentWith({ module: 'Referrers', action: 'getReferrerType', fwdsNoSegment: '1', filter_sort_column: 'nb_visits' });
check(!sorted.segment, 'a sorted "all data" table must stay without a segment, got ' + JSON.stringify(segmentOf(sorted)));
// a request of that table that names its own segment (a row's segmented visitor log) keeps it
var row = sentWith({ module: 'Live', action: 'getLastVisitsDetails', fwdsNoSegment: '1', segment: 'referrerType==search' });
check(row.segment === 'referrerType==search', 'an explicit segment must stay, got ' + JSON.stringify(segmentOf(row)));
// the marker sent as POST parameter counts too
var posted = sentWith({ module: 'Referrers', action: 'getReferrerType' }, { fwdsNoSegment: '1' });
check(!posted.segment, 'the marker in the POST parameters must count too, got ' + JSON.stringify(segmentOf(posted)));
// every other request keeps Matomo's behaviour
var plain = sentWith({ module: 'Referrers', action: 'getReferrerType' });
check(plain.segment === PAGE_SEGMENT, 'a request without the marker gets the page segment, got ' + JSON.stringify(segmentOf(plain)));

// 3. a dashboard default "No segment (all data)" cleared the page's segment on entry; a segment chosen at the top during
//    the visit wins (README), so widgets without an override follow the page, a widget set to "all data" does not
DS.settings = { widgets: { all: { segment: { action: 'remove' } } }, defaultAction: { action: 'remove' } };
var byDefault = load('other');
check(byDefault.segment === PAGE_SEGMENT && !('fwdsNoSegment' in byDefault), 'a widget following the default "all data" follows the segment chosen at the top: ' + JSON.stringify(byDefault));
check(!load('all').segment, 'a widget set to "all data" stays without a segment under a default "all data"');

// 4. robustness: installed once; an error inside falls back to Matomo's own behaviour
check(AjaxHelper.prototype.mixinDefaultGetParams !== originalMixin, 'the ajaxHelper must be extended for signed-in users');
var hooked = AjaxHelper.prototype.mixinDefaultGetParams;
DS.installWrapper();
check(AjaxHelper.prototype.mixinDefaultGetParams === hooked, 'the extension must be installed only once');
var broken = new window.ajaxHelper();
broken.removeDefaultParameter = function () { throw new Error('changed in a later Matomo'); };
broken.addParams({ fwdsNoSegment: '1' }, 'get');
var quiet = console.error; console.error = function () {};
var fallback;
try { fallback = broken.mixinDefaultGetParams(broken.getParams); } catch (e) { fallback = e; }
console.error = quiet;
check(fallback && fallback.segment === PAGE_SEGMENT, 'an error in the extension must fall back to Matomo\'s behaviour, got ' + String(fallback && (fallback.message || JSON.stringify(fallback))));

if (failures.length) {
    failures.forEach(function (f) { console.error('FAIL: ' + f); });
    process.exit(1);
}
console.log('NO-SEGMENT OK: "all data" widgets load and reload without the page segment, other requests unchanged');
