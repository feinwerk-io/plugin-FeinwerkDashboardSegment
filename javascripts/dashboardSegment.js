/**
 * Matomo - free/libre analytics platform
 *
 * FeinwerkDashboardSegment: applies a segment AND/OR a period override per dashboard widget INSTANCE by
 * wrapping the global widgetsHelper.loadWidgetAjax choke point, and adds pickers to each widget
 * header plus a dashboard-wide default segment control. Pure-additive: no core files are modified.
 *
 * Per-instance: Matomo gives every instance of the same widget the identical `widgetId`, so we tag
 * each instance with a stable `dsSegId` stored in its layout parameters (persisted through
 * Dashboard's own saveLayout) and key overrides by that id, per site.
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */
(function () {
    'use strict';

    var NONE = '__none__';
    // Request parameter of a widget set to "No segment (all data)", see applyAction()
    var NO_SEGMENT_PARAM = 'fwdsNoSegment';

    // Period presets: key -> Matomo period/date pair + translation key.
    var PERIOD_PRESETS = [
        { key: 'today',     period: 'day',   date: 'today',     label: 'FeinwerkDashboardSegment_PeriodToday' },
        { key: 'yesterday', period: 'day',   date: 'yesterday', label: 'FeinwerkDashboardSegment_PeriodYesterday' },
        { key: 'last7',     period: 'range', date: 'last7',     label: 'FeinwerkDashboardSegment_PeriodLast7' },
        { key: 'last30',    period: 'range', date: 'last30',    label: 'FeinwerkDashboardSegment_PeriodLast30' },
        { key: 'week',      period: 'week',  date: 'today',     label: 'FeinwerkDashboardSegment_PeriodWeek' },
        { key: 'month',     period: 'month', date: 'today',     label: 'FeinwerkDashboardSegment_PeriodMonth' },
        { key: 'year',      period: 'year',  date: 'today',     label: 'FeinwerkDashboardSegment_PeriodYear' }
    ];
    function presetByKey(key) {
        var found = null;
        PERIOD_PRESETS.forEach(function (p) { if (p.key === key) { found = p; } });
        return found;
    }
    // "Last 30 days: from ... to ..." for the chip's tooltip (Peter, 2026-11-24, P2 A: presets count from today). Matomo's
    // own period helpers (site time zone); '' where they are missing.
    function presetRangeText(preset) {
        try {
            var range = window.CoreHome.Periods.parse(preset.period, preset.date).getDateRange();
            var lang = (window.piwik && window.piwik.language) || undefined;
            var fmt = function (d) { return d.toLocaleDateString(lang, { year: 'numeric', month: 'short', day: 'numeric' }); };
            if (range[0].getTime() === range[1].getTime()) { return fmt(range[0]); }
            return _pk_translate('General_DateRangeFromTo', [fmt(range[0]), fmt(range[1])]);
        } catch (e) {
            return '';
        }
    }

    function presetForStored(period, date) {
        var found = null;
        PERIOD_PRESETS.forEach(function (p) { if (p.period === period && p.date === date) { found = p; } });
        return found;
    }

    var FeinwerkDashboardSegment = {
        // resolved settings for the active dashboard/site:
        //   { widgets: { instanceId: { segment: action, period: {period,date} } }, defaultAction }
        settings: { widgets: {}, defaultAction: null },
        idDashboard: null,
        wrapped: false,
        segments: null,
        baselineSegment: null, // encoded global segment the user had before we first drove it (restore target)
        appliedSegment: null   // encoded global segment we last set for a dashboard default (null = we drive nothing)
    };

    // Current dashboard id from the URL hash (category `Dashboard_Dashboard`, the id is the `subcategory`). null on
    // every other page: goal pages and other reports use numeric subcategories too.
    function currentDashboardId() {
        var broadcast = window.broadcast;
        if (!broadcast) { return null; }
        var category = broadcast.getValueFromHash('category') || broadcast.getValueFromUrl('category') || '';
        if (category !== 'Dashboard_Dashboard') { return null; }
        var value = broadcast.getValueFromHash('subcategory') || broadcast.getValueFromUrl('subcategory') || '';
        var id = parseInt(value, 10);
        return isNaN(id) ? null : id;
    }

    function currentIdSite() {
        if (window.piwik && window.piwik.idSite) { return window.piwik.idSite; }
        var broadcast = window.broadcast;
        var v = (broadcast && (broadcast.getValueFromHash('idSite') || broadcast.getValueFromUrl('idSite'))) || '';
        return v || null;
    }

    // Idiomatic Matomo request via ajaxHelper (handles CSRF token + idSite/period/date defaults).
    // NOTE: ajaxHelper auto-injects the page's global `segment`/`period`/`date`, so our own payload
    // uses distinct names (segmentValue / periodValue / dateValue) to avoid being clobbered.
    // `ownErrorUi`: the caller shows its own notification on failure, so core's generic error box
    // is switched off for this request (as core does for createErrorNotification: false).
    function dsAjax(action, getParams, postParams, ownErrorUi) {
        var ajax = new window.ajaxHelper();
        ajax.addParams(window.$.extend({ module: 'FeinwerkDashboardSegment', action: action }, getParams || {}), 'get');
        if (postParams) { ajax.addParams(postParams, 'post'); }
        ajax.withTokenInUrl();
        ajax.setFormat('json');
        if (ownErrorUi) { ajax.setErrorCallback(null); }
        return ajax.send();
    }

    // User-facing toast for a failed action (previously these failed silently with only a console
    // error). Reuses Matomo's own notification UI; guarded so a missing require() — e.g. in the JS
    // smoke test — never throws.
    function notify(message, context) {
        try {
            var UI = require('piwik/UI');
            new UI.Notification().show(message, { context: context || 'error', type: 'toast' });
        } catch (e) {
            if (window.console) { window.console.error('FeinwerkDashboardSegment:', message); }
        }
    }

    function notifySaveError() { notify(_pk_translate('FeinwerkDashboardSegment_SaveError'), 'error'); }

    // ---- per-instance identity --------------------------------------------------------------

    function instanceIdOf(widget) {
        return (widget && widget.widgetParameters && widget.widgetParameters.dsSegId) || '';
    }

    function newInstanceId() {
        return 'i' + (new Date()).getTime().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function ensureInstanceId(widget) {
        var id = instanceIdOf(widget);
        if (!id) {
            id = newInstanceId();
            if (typeof widget.setParameters === 'function') {
                widget.setParameters({ dsSegId: id });
            } else {
                widget.element.trigger('setParameters.dashboardWidget', [{ dsSegId: id }]);
                if (widget.widgetParameters) { widget.widgetParameters.dsSegId = id; }
            }
        }
        widget.element.attr('data-ds-segid', id);
        return id;
    }

    function reloadWidgetEl($el) {
        try {
            $el.dashboardWidget('reload', false, true);
        } catch (e) {
            if (window.console) { window.console.error('FeinwerkDashboardSegment reload failed', e); }
        }
    }

    // Apply a resolved segment action to an outgoing params object. `own`: the widget's own override, not the default.
    function applyAction(params, action, own) {
        delete params[NO_SEGMENT_PARAM];
        if (!action) { return; }
        if (action.action === 'remove' && own) {
            // Matomo's ajaxHelper fills a missing or empty segment with the page's one. An explicit empty segment is
            // kept since Matomo 5.14; the marker makes installNoSegmentDefault() keep it on every version. Matomo copies
            // the widget request's parameters into the widget's tables, so their own requests (sorting, paging) carry
            // the marker too, while they leave the empty segment out.
            params.segment = '';
            params[NO_SEGMENT_PARAM] = '1';
        } else if (action.action === 'remove') {
            // A dashboard default "all data" cleared the page's segment on entry; a segment chosen at the top during
            // the visit wins (README), so these widgets follow the page.
            delete params.segment;
        } else if (action.action === 'set') { params.segment = action.segment; }
        // 'inherit' (or absent) => leave params.segment untouched.
    }

    // A request that carries the marker gets no segment from the page: only that default is switched off, a segment the
    // request names itself (a table row's segmented visitor log, for example) stays. Installed once, and only when
    // Matomo's ajaxHelper has the method; an error inside leaves Matomo's own behaviour.
    var noSegmentDefaultFor = null;
    function hasNoSegmentMarker(params) {
        return !!params && String(params[NO_SEGMENT_PARAM]) === '1';
    }
    function installNoSegmentDefault() {
        var proto = window.ajaxHelper && window.ajaxHelper.prototype;
        if (!proto || typeof proto.mixinDefaultGetParams !== 'function' || noSegmentDefaultFor === proto) { return; }
        var original = proto.mixinDefaultGetParams;
        proto.mixinDefaultGetParams = function (params) {
            try {
                if ((hasNoSegmentMarker(params) || hasNoSegmentMarker(this.postParams))
                    && typeof this.removeDefaultParameter === 'function') {
                    this.removeDefaultParameter('segment');
                }
            } catch (e) {
                if (window.console) { window.console.error('FeinwerkDashboardSegment no-segment request failed', e); }
            }
            return original.apply(this, arguments);
        };
        noSegmentDefaultFor = proto;
    }

    // ---- settings access --------------------------------------------------------------------

    FeinwerkDashboardSegment.entryFor = function (instanceId) {
        return (instanceId && Object.prototype.hasOwnProperty.call(this.settings.widgets, instanceId))
            ? this.settings.widgets[instanceId] : null;
    };

    // Effective segment action: instance override wins, else dashboard default, else inherit.
    FeinwerkDashboardSegment.actionFor = function (instanceId) {
        var e = this.entryFor(instanceId);
        if (e && e.segment) { return e.segment; }
        return this.settings.defaultAction; // may be null => inherit
    };

    // Effective period override for an instance: {period,date} or null (inherit dashboard range).
    FeinwerkDashboardSegment.periodFor = function (instanceId) {
        var e = this.entryFor(instanceId);
        return (e && e.period) || null;
    };

    FeinwerkDashboardSegment.hasAnySettings = function () {
        return !!(this.settings.defaultAction || Object.keys(this.settings.widgets).length);
    };

    // Stored raw segment value for the picker ('' = inherit, NONE, or a definition).
    FeinwerkDashboardSegment.currentWidgetValue = function (instanceId) {
        var e = this.entryFor(instanceId);
        var a = e && e.segment;
        if (!a) { return ''; }
        if (a.action === 'remove') { return NONE; }
        if (a.action === 'set') { return a.segment; }
        return '';
    };

    FeinwerkDashboardSegment.currentDefaultValue = function () {
        var a = this.settings.defaultAction;
        if (!a) { return ''; }
        if (a.action === 'remove') { return NONE; }
        if (a.action === 'set') { return a.segment; }
        return '';
    };

    // Period preset key currently active for the picker ('' = inherit).
    FeinwerkDashboardSegment.currentPeriodKey = function (instanceId) {
        var p = this.periodFor(instanceId);
        if (!p) { return ''; }
        var preset = presetForStored(p.period, p.date);
        return preset ? preset.key : '';
    };

    // ---- core wrapper -----------------------------------------------------------------------

    FeinwerkDashboardSegment.installWrapper = function () {
        installNoSegmentDefault();
        if (this.wrapped || !window.widgetsHelper || typeof window.widgetsHelper.loadWidgetAjax !== 'function') {
            return;
        }
        var original = window.widgetsHelper.loadWidgetAjax;
        var self = this;
        window.widgetsHelper.loadWidgetAjax = function (widgetUniqueId, widgetParameters, onLoaded, onError) {
            // The dashboard has its layout and loads its widgets: a global segment change waiting for it runs now.
            // Dashboard.Dashboard.mounted normally started it already; this covers a mounted event we did not see.
            markDashboardRendered();
            if (globalSegmentChangeAhead()) {
                // That change reloads the whole dashboard right away and Matomo aborts this request then, but the
                // server would still compute it. Not sending it halves the widget requests on entering the dashboard.
                return { aborted: true, ajaxRequest: null, abort: function () {} };
            }
            var params = widgetParameters;
            try {
                var instanceId = widgetParameters && widgetParameters.dsSegId;
                // Clone so we never mutate the widget's persistent parameter object,
                // and drop our internal marker so it is not sent to the widget request.
                params = window.$.extend({}, widgetParameters);
                delete params.dsSegId;
                var entry = self.entryFor(instanceId);
                applyAction(params, self.actionFor(instanceId), !!(entry && entry.segment));
                var p = self.periodFor(instanceId);
                if (p && p.period) { params.period = p.period; params.date = p.date; }
            } catch (e) {
                params = widgetParameters; // fall back to the original on any error
                if (window.console) { window.console.error('FeinwerkDashboardSegment override failed', e); }
            }
            return original.call(this, widgetUniqueId, params, onLoaded, onError);
        };
        this.wrapped = true;
    };

    // ---- dashboard default -> Matomo global segment -----------------------------------------
    // Reactive Vue widgets (graphs, KPI/single-metric, sparklines, Live!, the map) read the GLOBAL
    // segment and never flow through our loadWidgetAjax wrapper. To make a dashboard default filter
    // them too, we set Matomo's global segment to the default while that dashboard is open and
    // restore the user's baseline when a dashboard has no default. We use the same hash-only idiom
    // as Matomo's own segment selector on a reporting page (CoreHome.MatomoUrl.updateHash): it
    // reloads the widgets WITHOUT a full page reload, so the in-memory state below survives and the
    // baseline capture stays correct. We act only on dashboard entry (a context change), so a manual
    // segment change during a visit stands until re-open. Segment values here are raw definitions
    // (decoded), as MatomoUrl stores/returns them.

    function matomoUrl() {
        return (window.CoreHome && window.CoreHome.MatomoUrl) || null;
    }

    // Guard literal '%' exactly as Matomo's own selector does before MatomoUrl re-encodes the hash
    // (idempotent, so comparing against a value read back from the hash stays consistent).
    function guardSegment(raw) {
        return String(raw).replace(/%$/, '%25').replace(/%([^\d].)/g, '%25$1');
    }

    // The global segment currently in the URL hash, as a raw (decoded) definition. '' when none.
    function readGlobalSegment() {
        var mu = matomoUrl();
        return (mu && mu.hashParsed && mu.hashParsed.value && mu.hashParsed.value.segment) || '';
    }

    // Matomo aborts every pending request when the URL changes. Changing the global segment while a
    // dashboard is still loading (its widget list, its layout) aborts that load and the dashboard
    // stays empty, so on a dashboard the hash is only changed once the dashboard has rendered.
    var renderedDashboard = null;    // id of the dashboard Matomo last rendered (null: none / loading)
    var pendingGlobalSegment = null; // {value, from, onApplied} to set once the current dashboard has rendered
    var scheduledGlobalSegment = null; // that change once the dashboard has rendered, until it runs

    function dashboardRendered() {
        var id = currentDashboardId();
        return id === null || id === renderedDashboard;
    }

    // Called when Matomo has mounted the dashboard (Dashboard.Dashboard.mounted, once it has its layout and right before
    // it creates the widgets), when it loads a widget and when a widget has loaded.
    function markDashboardRendered() {
        renderedDashboard = currentDashboardId();
        if (pendingGlobalSegment === null) { return; }
        var pending = pendingGlobalSegment;
        pendingGlobalSegment = null;
        scheduledGlobalSegment = pending;
        // after the dashboard's own rendering code has returned (its widgets are created before this runs)
        window.setTimeout(function () {
            if (scheduledGlobalSegment === pending) { scheduledGlobalSegment = null; }
            var current = readGlobalSegment();
            // A segment the user picked by hand while the dashboard loaded stands.
            if (current === pending.from && current !== pending.value) { applyGlobalSegmentNow(pending.value); }
            if (pending.onApplied) { pending.onApplied(); }
        }, 0);
    }

    // Another dashboard (or page) loads: a change still waiting for the old one is dropped without
    // running its onApplied, so whatever it owed (e.g. restoring the user's segment) stays owed.
    function forgetRenderedDashboard() {
        renderedDashboard = null;
        pendingGlobalSegment = null;
        scheduledGlobalSegment = null;
    }

    // Whether setting the hash segment to `value` changes the segment Matomo's pages go by (MatomoUrl.parsed), which
    // is what reloads the dashboard. The hash wins over the query string, and an empty segment is dropped from the
    // hash, so a segment in the query string (a bookmark, a link) shows through again.
    function hashSegmentChangeReloads(value) {
        var mu = matomoUrl();
        if (!mu || typeof mu.updateHash !== 'function' || !mu.parsed || !mu.parsed.value || !mu.urlParsed || !mu.urlParsed.value) {
            return false;
        }
        return (value || mu.urlParsed.value.segment || '') !== (mu.parsed.value.segment || '');
    }

    // A global segment change will reload the whole dashboard right away: it waits for the dashboard to render or
    // is about to run, and it changes the segment Matomo's pages go by. Not when the user picked another segment
    // meanwhile (that one stands).
    function globalSegmentChangeAhead() {
        var ahead = pendingGlobalSegment || scheduledGlobalSegment;
        return ahead !== null && readGlobalSegment() === ahead.from && hashSegmentChangeReloads(ahead.value);
    }

    // A later decision found nothing to change: a change still waiting would overwrite it.
    function cancelPendingGlobalSegment() {
        pendingGlobalSegment = null;
    }

    // Set the global segment to `value` ('' clears it), right away or once the dashboard has
    // rendered; `onApplied` runs once it has been set. Returns true if it changed (or will change)
    // the hash, which reloads the widgets.
    function applyGlobalSegment(value, onApplied) {
        if (!dashboardRendered()) {
            pendingGlobalSegment = { value: value, from: readGlobalSegment(), onApplied: onApplied || null };
            return true;
        }
        var changed = applyGlobalSegmentNow(value);
        if (onApplied) { onApplied(); }
        return changed;
    }

    // Hash-only via MatomoUrl (no full page reload), keeping period/date and the rest of the hash,
    // exactly like the native selector. Returns true if it changed the hash.
    function applyGlobalSegmentNow(value) {
        var mu = matomoUrl();
        if (mu && typeof mu.updateHash === 'function' && mu.hashParsed && mu.hashParsed.value) {
            mu.updateHash(window.$.extend({}, mu.hashParsed.value, { segment: value }));
            return true;
        }
        // Fallback when MatomoUrl is unavailable: the heavier full-reload idiom (broadcast).
        var b = window.broadcast;
        if (b && typeof b.propagateNewPage === 'function') {
            b.propagateNewPage('segment=' + encodeURIComponent(value), true, undefined,
                ['compareSegments', 'comparePeriods', 'compareDates']);
            return true;
        }
        return false;
    }

    // What the global segment should be for the active dashboard's settings.
    //   drive=false -> no default here: leave the user's segment alone.
    //   drive=true  -> value is the raw segment to enforce ('' = __none__ default = all data).
    FeinwerkDashboardSegment.desiredGlobalForSettings = function () {
        var a = this.settings.defaultAction;
        if (!a) { return { drive: false, value: '' }; }
        if (a.action === 'remove') { return { drive: true, value: '' }; }
        if (a.action === 'set')    { return { drive: true, value: guardSegment(a.segment) }; }
        return { drive: false, value: '' };
    };

    // Apply the active dashboard's default to the global segment. Returns true if it changed the
    // global segment (which reloads the widgets, so the caller must NOT also reload them).
    FeinwerkDashboardSegment.syncGlobalSegmentForDashboard = function () {
        var desired = this.desiredGlobalForSettings();
        var current = readGlobalSegment();
        if (!desired.drive) {
            return this.restoreBaselineSegment(); // no default here -> restore the user's baseline
        }
        if (this.baselineSegment === null) { this.baselineSegment = current; } // capture once
        this.appliedSegment = desired.value;
        if (current === desired.value) { cancelPendingGlobalSegment(); return false; } // already correct -> no reload
        return applyGlobalSegment(desired.value);
    };

    // Restore the user's baseline global segment (leaving a defaulted dashboard / entering one
    // without a default). Returns true if it changed the global segment.
    // A restore deferred until a loading dashboard has rendered stays owed (appliedSegment is kept)
    // until it has actually run, so leaving that dashboard early still restores on the next page.
    FeinwerkDashboardSegment.restoreBaselineSegment = function () {
        if (this.appliedSegment === null) { cancelPendingGlobalSegment(); return false; } // we weren't driving anything
        var self = this;
        var owed = this.appliedSegment;
        var target = this.baselineSegment || '';
        if (readGlobalSegment() === target) {
            this.appliedSegment = null;
            cancelPendingGlobalSegment();
            return false;
        }
        return applyGlobalSegment(target, function () {
            if (self.appliedSegment === owed) { self.appliedSegment = null; } // unless a newer default took over
        });
    };

    // ---- settings + segment list fetch ------------------------------------------------------

    // Every read of the settings gets a number: an answer that arrives after the answer of a newer read
    // (another dashboard opened, a re-synced copy read again) is stale and must not overwrite it.
    var settingsRead = 0;

    FeinwerkDashboardSegment.fetchSettingsPromise = function (ownErrorUi) {
        var self = this;
        var read = ++settingsRead;
        self.idDashboard = currentDashboardId();
        if (self.idDashboard === null) {
            self.settings = { widgets: {}, defaultAction: null };
            return window.$.Deferred().resolve(self.settings).promise();
        }
        return dsAjax('getSettings', { idDashboard: self.idDashboard, idSite: currentIdSite() }, null, ownErrorUi).then(function (data) {
            if (read === settingsRead) {
                self.settings = {
                    widgets: (data && data.widgets) || {},
                    defaultAction: (data && data.defaultAction) || null
                };
            }
            return self.settings;
        });
    };

    // `callback` runs only for the newest read; a newer one runs its own.
    FeinwerkDashboardSegment.fetchSettings = function (callback) {
        var self = this;
        var promise = this.fetchSettingsPromise();
        var read = settingsRead;
        promise.then(function () {
            if (read === settingsRead && callback) { callback(); }
        }, function () {
            if (read !== settingsRead) { return; }
            self.settings = { widgets: {}, defaultAction: null };
            if (callback) { callback(); }
        });
    };

    FeinwerkDashboardSegment.loadSegments = function (callback) {
        if (this.segments) { callback(this.segments); return; }
        var self = this;
        dsAjax('getSegments', {}).then(function (list) {
            self.segments = (list || []).map(function (s) { return { definition: s.definition, name: s.name }; });
            callback(self.segments);
        }, function () { callback([]); });
    };

    FeinwerkDashboardSegment.segmentName = function (definition) {
        var found = null;
        (this.segments || []).forEach(function (s) { if (s.definition === definition) { found = s.name; } });
        return found || _pk_translate('FeinwerkDashboardSegment_CustomSegment');
    };

    FeinwerkDashboardSegment.reloadAllWidgets = function () {
        window.$('[widgetId]').each(function () { reloadWidgetEl(window.$(this)); });
    };

    // Reload only the widgets that carry a per-instance override. Used on open when no dashboard
    // default is set, so untouched widgets (and their own view settings such as the row count) are
    // never needlessly re-rendered by us.
    FeinwerkDashboardSegment.reloadOverriddenWidgets = function () {
        var self = this;
        window.$('[widgetId]').each(function () {
            var $el = window.$(this);
            var id = $el.attr('data-ds-segid');
            if (id && Object.prototype.hasOwnProperty.call(self.settings.widgets, id)) {
                reloadWidgetEl($el);
            }
        });
    };

    // Apply overrides to already-rendered widgets: a dashboard default affects all widgets, else
    // only the overridden ones need a reload.
    FeinwerkDashboardSegment.applyToRendered = function () {
        if (this.settings.defaultAction) {
            this.reloadAllWidgets();
        } else if (Object.keys(this.settings.widgets).length) {
            this.reloadOverriddenWidgets();
        }
    };

    // ---- save -------------------------------------------------------------------------------
    // Each save resolves true once stored and the settings are re-read, false when it did not
    // complete. Failures show the plugin's own notification only: the save failed, or it was stored
    // but the settings could not be re-read (then a reload shows it). It never rejects: ajaxHelper
    // rejects on every failed request, and a rejection nobody handles would surface as a page error.

    function saveAndRefetch(action, getParams, postParams) {
        return dsAjax(action, getParams, postParams, true).then(function () {
            return FeinwerkDashboardSegment.fetchSettingsPromise(true).then(
                function () { return true; },
                function () {
                    notify(_pk_translate('FeinwerkDashboardSegment_SavedReloadHint'), 'warning');
                    return false;
                }
            );
        }, function () {
            notifySaveError();
            return false;
        });
    }

    FeinwerkDashboardSegment.saveWidget = function (instanceId, segment) {
        var id = this.idDashboard;
        if (id === null || !instanceId) { return window.$.Deferred().resolve(false).promise(); }
        return saveAndRefetch('saveWidgetSegment',
            { idDashboard: id, idSite: currentIdSite(), widgetUniqueId: instanceId },
            { segmentValue: segment });
    };

    FeinwerkDashboardSegment.saveWidgetPeriod = function (instanceId, presetKey) {
        var id = this.idDashboard;
        if (id === null || !instanceId) { return window.$.Deferred().resolve(false).promise(); }
        var preset = presetKey ? presetByKey(presetKey) : null;
        return saveAndRefetch('saveWidgetPeriod',
            { idDashboard: id, idSite: currentIdSite(), widgetUniqueId: instanceId },
            { periodValue: preset ? preset.period : '', dateValue: preset ? preset.date : '' });
    };

    FeinwerkDashboardSegment.saveDefault = function (segment) {
        var id = this.idDashboard;
        if (id === null) { return window.$.Deferred().resolve(false).promise(); }
        return saveAndRefetch('saveDashboardDefault',
            { idDashboard: id, idSite: currentIdSite() },
            { segmentValue: segment });
    };

    // ---- menus ------------------------------------------------------------------------------
    // One menu at a time (a widget's segment or time range, the dashboard default), all with the same behaviour: a list
    // of options (listbox, aria-selected), Up/Down/Home/End move, Enter or Space picks, Escape closes; after a pick or
    // Escape the focus goes back to the button that opened it, a click outside or Tab closes it. The segment menus have
    // a labelled search field (Down goes into the list, Enter picks the only match). A menu opens under its button and
    // stays inside the window: where it would cross the right edge it lines up with the button's right edge.
    var activeMenu = null;
    var menuSeq = 0;

    function closeActiveMenu(focusOpener) {
        if (activeMenu) { activeMenu.close(focusOpener); }
    }

    // fixed: the menu sits in a maximised widget (Matomo's modal dialog) and is placed in window coordinates there
    function positionMenu($menu, $anchor, fixed) {
        var rect = fixed && $anchor[0] && $anchor[0].getBoundingClientRect ? $anchor[0].getBoundingClientRect() : null;
        var off = rect ? { top: rect.top, left: rect.left } : $anchor.offset();
        var top = off.top + $anchor.outerHeight();
        var left = off.left;
        try {
            var margin = 8;
            var $win = window.$(window);
            var viewLeft = rect ? 0 : $win.scrollLeft();
            var viewRight = viewLeft + ((document.documentElement && document.documentElement.clientWidth) || $win.width());
            var width = $menu.outerWidth();
            if (left + width > viewRight - margin) { left = off.left + $anchor.outerWidth() - width; }
            left = Math.max(viewLeft + margin, Math.min(left, viewRight - margin - width));
        } catch (e) {
            left = off.left;
        }
        $menu.css({ position: rect ? 'fixed' : 'absolute', top: top, left: left });
    }

    // options: { label, heading (a visible first line, optional), items: [{label, value}], current, search (placeholder and
    // label, or null), noMatch, note (a muted line under the list, optional), footers (links under the list, [$el]),
    // onPick(value) }
    function showMenu($opener, options) {
        if (activeMenu && activeMenu.opener === $opener[0]) { closeActiveMenu(true); return; } // the same button again
        closeActiveMenu(false);

        var listId = 'fwds-menu-' + (++menuSeq);
        var $menu = window.$('<div class="dashboardSegmentMenu"></div>');
        var $list = window.$('<div class="dsMenuList" role="listbox"></div>').attr('id', listId).attr('aria-label', options.label);
        var rows = [];
        var $search = null;
        var $none = null;
        var closed = false;
        var footers = options.footers || [];

        function visibleRows() {
            return rows.filter(function ($r) { return $r.css('display') !== 'none'; });
        }
        function focusRow(index) {
            var list = visibleRows();
            if (!list.length) { return; }
            list[Math.max(0, Math.min(index, list.length - 1))][0].focus();
        }
        function close(focusOpener) {
            if (closed) { return; }
            closed = true;
            window.$(document).off('mousedown.dsMenu keydown.dsMenu');
            $menu.remove();
            $opener.attr('aria-expanded', 'false');
            if (activeMenu && activeMenu.opener === $opener[0]) { activeMenu = null; }
            if (focusOpener && $opener[0] && typeof $opener[0].focus === 'function') { $opener[0].focus(); }
        }
        function pick(value) {
            close(true);
            options.onPick(value);
        }

        options.items.forEach(function (it) {
            var isActive = (it.value === options.current);
            var $r = window.$('<div class="dashboardSegmentItem" role="option" tabindex="-1"></div>')
                .attr('aria-selected', isActive ? 'true' : 'false')
                .attr('data-label', String(it.label || '').toLowerCase())
                .append(window.$('<span class="dsCheck" aria-hidden="true">✓</span>'))
                .append(window.$('<span class="dsItemLabel"></span>').text(it.label));
            if (isActive) { $r.addClass('active'); }
            $r.on('click', function () { pick(it.value); });
            $r.on('keydown', function (e) {
                var list = visibleRows();
                var at = list.indexOf($r);
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    // past the last option: the links below the list ("New segment", "Add a copy ...")
                    if (at >= list.length - 1 && footers.length) { footers[0][0].focus(); } else { focusRow(at + 1); }
                }
                else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (at <= 0 && $search) { $search[0].focus(); } else { focusRow(at - 1); }
                }
                else if (e.key === 'Home') { e.preventDefault(); focusRow(0); }
                else if (e.key === 'End') { e.preventDefault(); focusRow(list.length - 1); }
                else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(it.value); }
            });
            rows.push($r);
            $list.append($r);
        });

        var headingId = listId + '-heading';
        if (options.heading) {
            $menu.append(window.$('<div class="dsMenuHeading"></div>').attr('id', headingId).text(options.heading));
        }
        if (options.search) {
            $menu.addClass('dsSearchable');
            $search = window.$('<input type="text" class="dsMenuSearch browser-default" />')
                .attr('placeholder', options.search)
                .attr('aria-label', options.search)
                .attr('aria-controls', listId);
            if (options.heading) { $search.attr('aria-describedby', headingId); }
            $menu.append(window.$('<div class="dsMenuSearchWrap"></div>').append($search));
            $none = window.$('<div class="dsMenuNone" role="status"></div>').hide();
            $search.on('input', function () {
                var q = (this.value || '').toLowerCase();
                var hits = 0;
                rows.forEach(function ($r) {
                    var hit = !q || ($r.attr('data-label') || '').indexOf(q) !== -1;
                    $r.css('display', hit ? '' : 'none');
                    if (hit) { hits++; }
                });
                // a search without a match says so ("New segment" stays below it)
                if (hits) { $none.hide().text(''); } else { $none.text(options.noMatch || '').show(); }
            });
            $search.on('keydown', function (e) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (!visibleRows().length && footers.length) { footers[0][0].focus(); } else { focusRow(0); }
                }
                else if (e.key === 'Enter') {
                    e.preventDefault();
                    var list = visibleRows();
                    if (list.length === 1) { list[0].trigger('click'); } else { focusRow(0); }
                }
            });
        }
        $menu.append($list);
        if (options.search) { $menu.append($none); }
        if (options.note) { $menu.append(window.$('<div class="dsMenuNote"></div>').text(options.note)); }
        footers.forEach(function ($link, i) {
            $link.on('click', function () { close(false); });
            $link.on('keydown', function (e) {
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    var list = visibleRows();
                    if (i > 0) { footers[i - 1][0].focus(); }
                    else if (list.length) { list[list.length - 1][0].focus(); } else if ($search) { $search[0].focus(); }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (footers[i + 1]) { footers[i + 1][0].focus(); }
                } else if (e.key === ' ') { e.preventDefault(); $link.trigger('click'); }
            });
            $menu.append($link);
        });

        // Tab or Shift+Tab anywhere in the menu (option, search, "New segment"): the menu closes and the focus goes to its
        // button first, so the browser moves on to the control after or before that button, not to the end of the page
        $menu.on('keydown', function (e) {
            if (e.key === 'Tab') { close(true); }
            // Escape closes the menu only, not a maximised widget's dialog around it
            else if (e.key === 'Escape' || e.keyCode === 27) { e.preventDefault(); e.stopPropagation(); close(true); }
        });

        // A maximised widget is Matomo's modal dialog: a menu outside it would sit behind it, and the dialog would pull the
        // focus back. There the menu goes into the dialog and is placed in window coordinates.
        var $dialog = $opener.closest('.ui-dialog');
        (($dialog && $dialog.length) ? $dialog : window.$('body')).append($menu);
        positionMenu($menu, $opener, !!($dialog && $dialog.length));
        $opener.attr('aria-expanded', 'true');
        activeMenu = { opener: $opener[0], close: close };

        window.setTimeout(function () {
            if (closed) { return; }
            window.$(document).on('mousedown.dsMenu', function (e) {
                if ($menu[0] && !$menu[0].contains(e.target) && !($opener[0] && $opener[0].contains(e.target))) { close(false); }
            });
            window.$(document).on('keydown.dsMenu', function (e) {
                if (e.key === 'Escape' || e.keyCode === 27) { e.preventDefault(); close(true); }
            });
            if ($search) { $search[0].focus(); return; }
            var current = rows.filter(function ($r) { return $r.hasClass('active'); })[0];
            if (current) { current[0].focus(); } else { focusRow(0); }
        }, 0);
    }

    // Open Matomo's own segment editor (the top-bar selector) so a new saved segment can be created
    // without leaving the dashboard. Only offered when that selector is present on the page.
    function segmentEditorAvailable() {
        return window.$('.segmentationContainer, .add_new_segment').length > 0;
    }
    function openNewSegmentEditor() {
        var $add = window.$('.add_new_segment').first();
        if ($add.length) { $add[0].click(); return; }
        // panel collapsed: open it, then click "add new segment"
        var $toggle = window.$('.segmentationContainer .segmentationTitle, .segmentationContainer .title').first();
        if ($toggle.length) {
            $toggle[0].click();
            window.setTimeout(function () {
                var $a = window.$('.add_new_segment').first();
                if ($a.length) { $a[0].click(); }
            }, 150);
        }
    }

    // The segment menu: inherit, no segment, each saved segment, a search field and a "New segment" link. Our own
    // themed menu rather than Matomo's expandable-select, which is built for in-form use and misbehaves in a floating
    // popover. emptyKey: the label of "nothing chosen" ('' value); a widget inherits the dashboard default, the
    // dashboard default itself has none and uses the segment chosen at the top.
    // A maximised widget is Matomo's modal dialog: Matomo's segment editor would open behind it and a copy could not be
    // placed next to it, so "New segment" and "Add a copy" restore the widget first (quick UI review 2026-11-24, F1).
    function leaveMaximised($anchor) {
        var $content = $anchor.closest('.ui-dialog-content');
        if (!$content.length) { return; }
        try { $content.dialog('close'); } catch (e) { /* not a dialog any more */ }
    }

    // extras: { newFor: function () returning the widget's instance id or 'default' (B1), copy: function () (B3) }
    function openSegmentMenu($anchor, current, onPick, emptyKey, label, extras) {
        extras = extras || {};
        FeinwerkDashboardSegment.loadSegments(function (segments) {
            var items = [
                { label: _pk_translate(emptyKey || 'FeinwerkDashboardSegment_InheritDefault'), value: '' },
                { label: _pk_translate('FeinwerkDashboardSegment_NoSegment'), value: NONE }
            ];
            (segments || []).forEach(function (s) { items.push({ label: s.name, value: s.definition }); });

            var footers = [];
            if (segmentEditorAvailable()) {
                // Matomo's own icon font, not an emoji: without an emoji font a browser shows an empty box
                var $new = window.$('<a href="javascript:;" class="dsLink dsNewSegment"></a>')
                    .append(window.$('<span class="icon-add" aria-hidden="true"></span>'))
                    .append(window.$('<span class="dsLinkText"></span>').text(_pk_translate('FeinwerkDashboardSegment_NewSegment')));
                $new.on('click', function () {
                    leaveMaximised($anchor);
                    if (extras.newFor) { FeinwerkDashboardSegment.startNewSegmentFor(extras.newFor()); }
                    openNewSegmentEditor();
                });
                footers.push($new);
            }
            if (extras.copy) {
                var $copy = window.$('<a href="javascript:;" class="dsLink dsAddCopy"></a>')
                    .append(window.$('<span class="icon-plus-square" aria-hidden="true"></span>'))
                    .append(window.$('<span class="dsLinkText"></span>').text(_pk_translate('FeinwerkDashboardSegment_AddCopyWithSegment')));
                $copy.on('click', function () {
                    closeActiveMenu(false);
                    leaveMaximised($anchor);
                    window.setTimeout(extras.copy, 0); // after this menu has closed: the copy's menu opens on the same button
                });
                footers.push($copy);
            }
            showMenu($anchor, {
                label: label || _pk_translate('FeinwerkDashboardSegment_PickSegment'),
                items: items,
                current: current,
                search: _pk_translate('FeinwerkDashboardSegment_SearchSegments'),
                noMatch: _pk_translate('FeinwerkDashboardSegment_NoMatchingSegment'),
                note: (segments || []).length ? null : _pk_translate('FeinwerkDashboardSegment_NoSavedSegments'),
                footers: footers,
                onPick: onPick
            });
        });
    }

    // ---- B1: a segment made with "New segment" goes to the widget (or the default) it was made for ----------------
    // Peter, 2026-11-24 ("Erst B1-B4 umsetzen", B1). Matomo's segment editor saves and then reloads the whole page with
    // the new segment at the top (its mark: addSegmentAsNew in the hash). A short note in sessionStorage, written when
    // "New segment" is clicked, says for which widget or default it was meant and what was at the top before; on the
    // next entry of that dashboard the new segment goes there and the top goes back. The note lives 15 minutes and is
    // read once.
    var NEW_SEGMENT_NOTE = 'fwdsNewSegmentFor';

    // A save reloads the page right after Matomo's editor closes; the page starting to unload tells a save from a close.
    var leavingPage = false;
    var leavingWatched = false;

    function forgetNewSegmentNote() {
        try { window.sessionStorage.removeItem(NEW_SEGMENT_NOTE); } catch (e) { /* nothing to forget */ }
    }

    // The editor closed without a save (its close button, Escape, a click outside), or never opened: the note goes, so
    // a segment saved later through Matomo's own editor is not handed to the widget (quick UI review 2026-11-24, F2).
    function watchNewSegmentEditor() {
        if (!leavingWatched && typeof window.addEventListener === 'function') {
            leavingWatched = true;
            window.addEventListener('beforeunload', function () { leavingPage = true; });
        }
        var started = Date.now();
        var seen = false;
        var timer = window.setInterval(function () {
            var open = window.$('.segment-element:visible').length > 0;
            if (open) { seen = true; }
            var waited = Date.now() - started;
            if ((seen && !open) || (!seen && waited > 10000) || waited > 15 * 60 * 1000) {
                window.clearInterval(timer);
                window.setTimeout(function () { if (!leavingPage) { forgetNewSegmentNote(); } }, 1500);
            }
        }, 400);
    }

    FeinwerkDashboardSegment.startNewSegmentFor = function (target) {
        rememberNewSegmentFor(target);
        watchNewSegmentEditor();
    };

    function rememberNewSegmentFor(target) {
        try {
            window.sessionStorage.setItem(NEW_SEGMENT_NOTE, JSON.stringify({
                idSite: String(currentIdSite()),
                idDashboard: String(currentDashboardId()),
                target: target,
                before: readGlobalSegment(),
                baseline: FeinwerkDashboardSegment.baselineSegment,
                at: Date.now()
            }));
        } catch (e) {
            // without sessionStorage "New segment" only opens Matomo's editor, as before
        }
    }

    function takeNewSegmentNote() {
        var note = null;
        try {
            note = JSON.parse(window.sessionStorage.getItem(NEW_SEGMENT_NOTE) || 'null');
            window.sessionStorage.removeItem(NEW_SEGMENT_NOTE);
        } catch (e) {
            return null;
        }
        if (!note || note.idSite !== String(currentIdSite()) || note.idDashboard !== String(currentDashboardId())) { return null; }
        if (!(Date.now() - note.at < 15 * 60 * 1000)) { return null; }
        if (String(window.location.hash || '').indexOf('addSegmentAsNew=') === -1) { return null; } // not after a save
        var segment = readGlobalSegment();
        if (!segment || segment === note.before) { return null; }
        note.segment = segment;
        return note;
    }

    // The saved definition for a segment read from the URL (the URL may hold it decoded).
    function savedDefinition(segments, segment) {
        var found = segment;
        (segments || []).forEach(function (s) {
            var d = String(s.definition || '');
            var decoded = d;
            try { decoded = decodeURIComponent(d); } catch (e) { /* keep d */ }
            if (d === segment || decoded === segment) { found = d; }
        });
        return found;
    }

    // Runs at dashboard entry before the default is applied; calls done() when the entry may go on.
    FeinwerkDashboardSegment.applyNewSegmentNote = function (done) {
        var self = this;
        var note = takeNewSegmentNote();
        if (!note) { done(); return; }
        self.loadSegments(function (segments) {
            var definition = savedDefinition(segments, note.segment);
            var save = note.target === 'default' ? self.saveDefault(definition) : self.saveWidget(note.target, definition);
            save.then(function (saved) {
                if (saved) {
                    var name = self.segmentName(definition);
                    notify(note.target === 'default'
                        ? _pk_translate('FeinwerkDashboardSegment_NewSegmentIsDefault', [name])
                        : _pk_translate('FeinwerkDashboardSegment_NewSegmentForWidget', [name]), 'success');
                    var $w = window.$('[data-ds-segid="' + String(note.target).replace(/[^A-Za-z0-9_-]/g, '') + '"]');
                    if (note.target !== 'default' && $w.length && $w[0].scrollIntoView) {
                        window.setTimeout(function () { $w[0].scrollIntoView({ block: 'nearest' }); }, 1500);
                    }
                }
                if (saved && note.target !== 'default' && !self.settings.defaultAction) {
                    // no default drives the top: back to what was there before the editor (the restore of the entry
                    // that follows does it, as when leaving a dashboard with a default)
                    self.appliedSegment = note.segment;
                    self.baselineSegment = note.before;
                } else if (saved && note.baseline !== null && note.baseline !== undefined) {
                    // as if the editor had not changed the top: the user's own segment from before stays theirs
                    self.baselineSegment = note.baseline;
                }
                done();
            });
        });
    };

    // ---- B3: a copy of a widget with another segment, right below it -----------------------------------------------
    // Peter, 2026-11-24 (B3). Matomo's own dashboard API adds the widget (dashboard('addWidget')); the copy gets its
    // instance id and its segment (and the original's time range) before its first load, moves under the original, and
    // a parameter change makes Matomo save that order in the layout.
    FeinwerkDashboardSegment.addCopyWithSegment = function (widget, segment) {
        var self = this;
        var $orig = widget.element;
        var $area = window.$('#dashboardWidgetsArea');
        var $col = $orig.closest('.col');
        if (!$area.length || !$col.length || typeof $area.dashboard !== 'function') { return Promise.resolve(false); }
        var id = newInstanceId();
        var periodKey = self.currentPeriodKey(instanceIdOf(widget));
        var params = window.$.extend({}, widget.widgetParameters);
        delete params.segment;
        params.dsSegId = id;
        return self.saveWidget(id, segment).then(function (saved) {
            if (!saved || !periodKey) { return saved; }
            return self.saveWidgetPeriod(id, periodKey);
        }).then(function (saved) {
            if (!saved) { return false; }
            var before = $col.children('[widgetId]').length;
            $area.dashboard('addWidget', widget.uniqueId, $col.index() + 1, params, false, false);
            var $copy = $col.children('[widgetId]').last();
            if ($col.children('[widgetId]').length <= before || !$copy.length) {
                self.saveWidget(id, '');
                if (periodKey) { self.saveWidgetPeriod(id, ''); }
                return false;
            }
            $copy.insertAfter($orig);
            // addWidget saved the layout with the copy at the end of the column; a parameter change saves the new order,
            // a moment later so it does not overtake that save
            window.setTimeout(function () {
                try { $copy.dashboardWidget('setParameters', { dsSegId: id }); } catch (e) { /* saved with the next change */ }
            }, 800);
            if ($copy[0] && typeof $copy[0].scrollIntoView === 'function') { $copy[0].scrollIntoView({ block: 'nearest' }); }
            notify(_pk_translate('FeinwerkDashboardSegment_CopyAdded', [segment === NONE ? _pk_translate('FeinwerkDashboardSegment_NoSegment') : self.segmentName(segment)]), 'success');
            return true;
        });
    };

    function openCopyMenu($anchor, widget) {
        FeinwerkDashboardSegment.loadSegments(function (segments) {
            var items = [{ label: _pk_translate('FeinwerkDashboardSegment_NoSegment'), value: NONE }];
            (segments || []).forEach(function (s) { items.push({ label: s.name, value: s.definition }); });
            showMenu($anchor, {
                label: _pk_translate('FeinwerkDashboardSegment_SegmentForCopy'),
                heading: _pk_translate('FeinwerkDashboardSegment_SegmentForCopy'),
                items: items,
                current: FeinwerkDashboardSegment.currentWidgetValue(instanceIdOf(widget)) || null, // the original's own
                search: _pk_translate('FeinwerkDashboardSegment_SearchSegments'),
                noMatch: _pk_translate('FeinwerkDashboardSegment_NoMatchingSegment'),
                note: (segments || []).length ? null : _pk_translate('FeinwerkDashboardSegment_NoSavedSegments'),
                footers: [],
                onPick: function (value) {
                    FeinwerkDashboardSegment.addCopyWithSegment(widget, value).then(function (added) {
                        if (!added) { notifySaveError(); }
                    });
                }
            });
        });
    }

    function openPeriodMenu($anchor, current, onPick) {
        var items = [{ label: _pk_translate('FeinwerkDashboardSegment_InheritPeriod'), value: '' }];
        PERIOD_PRESETS.forEach(function (p) { items.push({ label: _pk_translate(p.label), value: p.key }); });
        showMenu($anchor, {
            label: _pk_translate('FeinwerkDashboardSegment_PickPeriod'),
            items: items,
            current: current,
            search: null,
            footers: [],
            onPick: onPick
        });
    }

    // ---- "current overrides" bar (chips) ----------------------------------------------------

    var chipSeq = 0;
    function makeChip(typeClass, iconClass, label, removeTitle, onRemove, tooltip) {
        var $chip = window.$('<span class="dashboardSegmentChip"></span>').addClass(typeClass);
        // the chip's full text (name, or a time range with its dates) for screen readers, read with its x
        var descId = 'fwds-chip-' + (++chipSeq);
        $chip.append(window.$('<span class="fwds-srOnly"></span>').attr('id', descId).text(tooltip || label));
        $chip.append(window.$('<span class="dashboardSegmentChipIcon" aria-hidden="true"></span>').addClass(iconClass));
        // the full name as tooltip (a long one is cut with an ellipsis), for a time range also its dates
        $chip.append(window.$('<span class="dashboardSegmentChipLabel"></span>').text(label).attr('title', tooltip || label));
        if (onRemove) { // read-only (subscribed) dashboards show the chip without a remove control
            var $x = window.$('<a href="javascript:;" role="button" class="dashboardSegmentRemove"></a>')
                .attr('title', removeTitle)
                .attr('aria-label', removeTitle)
                .attr('aria-describedby', descId)
                .append(window.$('<span aria-hidden="true">×</span>'));
            // removed by keyboard: refreshBar() rebuilds the bar, so the caller puts the focus back into the widget
            $x.on('click', function (e) { e.stopPropagation(); onRemove(document.activeElement === $x[0]); });
            $x.on('keydown', function (e) { if (e.key === ' ') { e.preventDefault(); $x.trigger('click'); } });
            $chip.append($x);
        }
        return $chip;
    }

    // After a chip was removed by keyboard: the x of the chip of that kind if there is one now (a segment chip's x leads
    // to the "No segment (all data)" chip), else the widget's button for it.
    function focusAfterRemove($el, chipClass, buttonClass) {
        var $target = $el.find('.dashboardSegmentChip.' + chipClass + ' .dashboardSegmentRemove').first();
        if (!$target.length) { $target = $el.find('.' + buttonClass).first(); }
        if ($target.length && typeof $target[0].focus === 'function') { $target[0].focus(); }
    }

    function refreshBar($el) {
        var $bar = $el.find('.dashboardSegmentBar').first();
        if (!$bar.length) { return; }
        var instanceId = $el.attr('data-ds-segid') || '';
        // a chip's x with the keyboard focus (the widget reloads and rebuilds its bar after a removal): the x of the
        // chip of that kind gets it back after the rebuild
        var focusedKind = null;
        var focused = document.activeElement;
        if (focused && $bar[0] && typeof $bar[0].contains === 'function' && $bar[0].contains(focused)) {
            focusedKind = window.$(focused).closest('.dashboardSegmentChip').hasClass('is-period') ? 'is-period' : 'is-segment';
        }
        $bar.empty();
        var any = false;

        // segment chip: the widget's own segment, or its own "No segment (all data)"; none while it inherits
        var segVal = FeinwerkDashboardSegment.currentWidgetValue(instanceId);
        if (segVal === NONE) {
            any = true;
            $bar.append(makeChip(
                'is-segment is-all', 'icon-segment',
                _pk_translate('FeinwerkDashboardSegment_NoSegment'),
                _pk_translate('FeinwerkDashboardSegment_InheritDefault'),
                isReadOnlyDashboard() ? null : function (byKeyboard) {
                    FeinwerkDashboardSegment.saveWidget(instanceId, '').then(function (saved) {
                        if (!saved) { return; }
                        refreshBar($el);
                        if (byKeyboard) { focusAfterRemove($el, 'is-segment', 'dashboardSegmentButton'); }
                        reloadWidgetEl($el);
                    });
                }
            ));
        } else if (segVal !== '') {
            any = true;
            $bar.append(makeChip(
                'is-segment', 'icon-segment',
                FeinwerkDashboardSegment.segmentName(segVal),
                _pk_translate('FeinwerkDashboardSegment_RemoveSegment'),
                isReadOnlyDashboard() ? null : function (byKeyboard) {
                    // back to the dashboard default, like the x of a time range (Peter, 2026-11-24, P1 A)
                    FeinwerkDashboardSegment.saveWidget(instanceId, '').then(function (saved) {
                        if (!saved) { return; }
                        refreshBar($el);
                        if (byKeyboard) { focusAfterRemove($el, 'is-segment', 'dashboardSegmentButton'); }
                        reloadWidgetEl($el);
                    });
                }
            ));
        }

        // period chip
        var perKey = FeinwerkDashboardSegment.currentPeriodKey(instanceId);
        if (perKey) {
            var preset = presetByKey(perKey);
            any = true;
            var perLabel = preset ? _pk_translate(preset.label) : perKey;
            var perDates = preset ? presetRangeText(preset) : '';
            $bar.append(makeChip(
                'is-period', 'icon-calendar',
                perLabel,
                _pk_translate('FeinwerkDashboardSegment_RemovePeriod'),
                isReadOnlyDashboard() ? null : function (byKeyboard) {
                    FeinwerkDashboardSegment.saveWidgetPeriod(instanceId, '').then(function (saved) {
                        if (!saved) { return; }
                        refreshBar($el);
                        if (byKeyboard) { focusAfterRemove($el, 'is-period', 'dashboardPeriodButton'); }
                        reloadWidgetEl($el);
                    });
                },
                perDates ? perLabel + '\n' + perDates : perLabel
            ));
        }

        if (any) { $bar.show(); } else { $bar.hide(); }
        if (focusedKind) {
            var $x = $bar.find('.dashboardSegmentChip.' + focusedKind + ' .dashboardSegmentRemove').first();
            if ($x.length && typeof $x[0].focus === 'function') { $x[0].focus(); }
        }
    }

    // ---- widget decoration ------------------------------------------------------------------

    // Widgets that fetch/refresh their data CLIENT-SIDE and read the segment/period directly from
    // the GLOBAL state (MatomoUrl) — sparklines, evolution graphs, the Live! widget, the visitor
    // map, and the containers that bundle them ("Visits Overview (with graph)", "Goals Overview")
    // — cannot honour a per-widget override (an additive plugin can't change global state for one
    // widget only). We hide the pickers there so the override isn't offered where it has no effect.
    //
    // Classify from the widget's PARAMETERS / uniqueId, which are known synchronously at
    // widget:create time — rendered DOM markers (.sparklineImg, vue-entry, ...) only appear after
    // the Vue content mounts, often too late for the initial decoration to skip the widget.
    function isUnsupportedWidget(widget) {
        var p = widget.widgetParameters || {};
        var module = (p.module || '') + '';
        var action = (p.action || '') + '';
        var view = ((p.viewDataTable || '') + '').toLowerCase();
        var uid = (widget.uniqueId || '') + '';

        // Live! and the visitor map refresh themselves client-side from the global segment.
        if (module === 'Live' || module === 'UserCountryMap') { return true; }
        if (uid.indexOf('widgetLive') === 0 || uid.indexOf('widgetUserCountryMap') === 0) { return true; }
        // Sparkline views and evolution graphs render their own data from global state.
        if (view.indexOf('sparkline') !== -1 || view.indexOf('graph') !== -1) { return true; }
        // Container widgets bundle sparklines/graphs -> an override would apply only partially.
        if (action === 'renderWidgetContainer' || /Overview|WithGraph/i.test(uid)) { return true; }

        // Fallback: rendered markers, for anything not classified by the parameters above.
        var $el = widget.element;
        if ($el.find('.sparklineImg, .visitsLiveFooter, .live-widget-loading').length) { return true; }
        if ($el.find('[vue-entry^="Live."]').length) { return true; }
        // Everything else needs a report the server rendered from this widget's own request (Matomo's report table,
        // `.dataTable[data-report]`, in the content when widget:create fires). Widgets of other plugins that load their
        // data in the browser (Feinwerk Live Dashboard, for example) have none and follow the dashboard's segment.
        return !$el.find('.dataTable[data-report]').length;
    }

    // The buttons and the bar for a widget: a supported report, or any widget that already has an override of its own,
    // so that override stays visible and can be removed (for example when its request failed and showed no report).
    FeinwerkDashboardSegment.offersOverrides = function (widget) {
        var entry = this.entryFor(instanceIdOf(widget));
        if (entry && (entry.segment || entry.period)) { return true; }
        return !isUnsupportedWidget(widget);
    };

    // A button of the widget header: a real button (keyboard, screen readers) with its name, like Matomo's own controls
    // next to it, and the state of the menu it opens.
    function widgetButton(cls, iconClass, labelKey) {
        var label = _pk_translate(labelKey);
        return window.$('<button type="button" class="button"></button>')
            .addClass(cls)
            .attr('title', label)
            .attr('aria-label', label)
            .attr('aria-haspopup', 'listbox')
            .attr('aria-expanded', 'false')
            .append(window.$('<span aria-hidden="true"></span>').addClass(iconClass));
    }

    // Insert the per-widget segment/period buttons into the widget header.
    //   - Matomo 5.14+ renders the header as a Vue ReportHeader; its widget-control cluster
    //     (`.reportHeader__widgetControls`) is our host. It mounts a tick AFTER widget:create, so we
    //     retry briefly until it (or the legacy toolbar) exists.
    //   - Matomo <= 5.13 uses the legacy `.widgetTop .buttons` toolbar.
    function injectWidgetButtons(widget, $top, attempt) {
        if (isReadOnlyDashboard()) { return; }        // subscribed dashboards: no editing
        if ($top.find('.dashboardSegmentButton').length) { return; } // already decorated

        // Matomo 5.14+: the native widget-control cluster (hover-revealed icon stack, top-right).
        // We inject INTO it so our buttons sit with the native controls (no overlap, no shifted
        // title). Matomo <= 5.13: the legacy `.widgetTop .buttons` toolbar.
        var $controls = $top.find('.reportHeader__widgetControls').first(); // Matomo 5.14+
        var $legacy = $controls.length ? window.$() : $top.find('.buttons').first(); // <= 5.13
        if (!$controls.length && !$legacy.length) {
            // Header (Vue or legacy) not in the DOM yet — retry for ~2s, then give up.
            if ((attempt || 0) < 20) {
                window.setTimeout(function () { injectWidgetButtons(widget, $top, (attempt || 0) + 1); }, 100);
            }
            return;
        }

        var $segBtn = widgetButton('dashboardSegmentButton', 'icon-segment', 'FeinwerkDashboardSegment_PickSegment');
        $segBtn.on('click', function (e) {
            e.stopPropagation();
            openSegmentMenu($segBtn, FeinwerkDashboardSegment.currentWidgetValue(instanceIdOf(widget)), function (value) {
                var id = ensureInstanceId(widget);
                FeinwerkDashboardSegment.saveWidget(id, value).then(function (saved) {
                    if (saved) { refreshBar(widget.element); reloadWidgetEl(widget.element); }
                });
            }, null, null, {
                newFor: function () { return ensureInstanceId(widget); },
                copy: function () { openCopyMenu($segBtn, widget); }
            });
        });

        var $perBtn = widgetButton('dashboardPeriodButton', 'icon-calendar', 'FeinwerkDashboardSegment_PickPeriod');
        $perBtn.on('click', function (e) {
            e.stopPropagation();
            openPeriodMenu($perBtn, FeinwerkDashboardSegment.currentPeriodKey(instanceIdOf(widget)), function (key) {
                var id = ensureInstanceId(widget);
                FeinwerkDashboardSegment.saveWidgetPeriod(id, key).then(function (saved) {
                    if (saved) { refreshBar(widget.element); reloadWidgetEl(widget.element); }
                });
            });
        });

        // The two filters come first, Matomo's window controls (refresh, minimise, maximise, close) after them, so close
        // stays last (Peter, 2026-11-24, D3). Inside the hover-revealed cluster of Matomo 5.14 and 6; the legacy toolbar of
        // 5.13 and older floats its buttons to the right, so there the last ones in the markup show first.
        if ($controls.length) {
            $controls.prepend($perBtn).prepend($segBtn);
        } else {
            $legacy.append($perBtn).append($segBtn);
        }
    }

    FeinwerkDashboardSegment.decorateWidget = function (widget) {
        var $top = widget.element.find('.widgetTop').first();
        if (!$top.length) { return; }
        if (!FeinwerkDashboardSegment.offersOverrides(widget)) { return; }

        widget.element.attr('data-ds-segid', instanceIdOf(widget));

        // "current overrides" bar — shown on read-only (subscribed) dashboards too, so the applied
        // segment/period stays visible there even though it can't be edited.
        if (!$top.next('.dashboardSegmentBar').length) {
            $top.after('<div class="dashboardSegmentBar" style="display:none"></div>');
        }

        // pickers only when editable (not on subscribed/linked dashboards)
        injectWidgetButtons(widget, $top, 0);

        refreshBar(widget.element);

        // Vue widgets (sparklines, Live!, ...) mount their content AFTER widget:create, so the
        // early isUnsupportedWidget() check above can miss them and decorate anyway. Re-check once
        // they've had time to render and strip our decoration if it turns out unsupported.
        var $w = widget.element;
        window.setTimeout(function () {
            if (!FeinwerkDashboardSegment.offersOverrides(widget)) {
                $w.find('.dashboardSegmentButton, .dashboardPeriodButton, .dashboardSegmentBar').remove();
            }
        }, 400);
    };

    // ---- dashboard default segment control --------------------------------------------------

    FeinwerkDashboardSegment.defaultLabel = function () {
        var a = this.settings.defaultAction;
        if (!a) { return _pk_translate('FeinwerkDashboardSegment_NoDashboardDefaultShort'); }
        if (a.action === 'remove') { return _pk_translate('FeinwerkDashboardSegment_NoSegment'); }
        return this.segmentName(a.segment);
    };

    // ---- room in Matomo's top bar ------------------------------------------------------------
    // Peter, 2026-11-24 (P4 B, the same in Feinwerk Dashboard Sharing; B2): the label "Dashboard segment:" gives way when
    // the bar would need another row: first to a short "Default:", then (after Dashboard Sharing's labels) entirely, with
    // icon and name left; the full label stays for screen readers (visually hidden) and in the tooltip.
    // javascripts/fwtopbar.js (shared with Dashboard Sharing) decides for both plugins together.
    function scheduleFit() {
        if (window.fwTopBar && typeof window.fwTopBar.schedule === 'function') { window.fwTopBar.schedule(); }
    }

    // The dashboard default segment as a button in Matomo's bar at the top (website, date, segment, Manage Dashboard),
    // in Matomo's own top-control markup: "[icon] Dashboard segment: <name>". The slot comes from
    // Template.nextToCalendar; where the bar is missing the button goes above the widgets.
    FeinwerkDashboardSegment.injectDefaultControl = function () {
        var self = this;
        var $area = window.$('#dashboardWidgetsArea');
        if (!$area.length || window.$('#dashboardSegmentDefault').length) { return; }
        // a subscribed (read-only) copy gets no button, also when its read-only state arrived before this call
        if (isReadOnlyDashboard()) { return; }

        var $ctrl = window.$('<div id="dashboardSegmentDefault" class="dashboardSegmentDefault piwikSelector borderedControl piwikTopControl"></div>');
        var $value = window.$('<a href="javascript:;" role="button" class="title dashboardSegmentDefaultValue"></a>')
            .attr('aria-haspopup', 'listbox')
            .attr('aria-expanded', 'false');
        $value.append(window.$('<span class="icon icon-segment icon-fixed dashboardSegmentDefaultIcon" aria-hidden="true"></span>'));
        // label and name in one text part, so they sit a normal space apart (the bar spaces only the icon)
        var $name = window.$('<span class="dashboardSegmentDefaultName"></span>');
        // the colon is in the translations (French puts a space before it); the short label ("Default:") shows where the
        // full one would cost the top bar a row (B2); screen readers read the full one, and the short one while it shows,
        // so a voice command with the visible word reaches the button
        var $label = window.$('<span class="dashboardSegmentDefaultLabel"></span>')
            .append(window.$('<span class="dsLabelFull"></span>').text(_pk_translate('FeinwerkDashboardSegment_DashboardSegmentButton') + ' '))
            .append(window.$('<span class="dsLabelShort"></span>').text(_pk_translate('FeinwerkDashboardSegment_DashboardSegmentButtonShort') + ' '));
        $value.append(window.$('<span class="dashboardSegmentDefaultText"></span>')
            .append($label)
            .append($name));
        // what the button is for, read by screen readers after its name (its tooltip repeats the name for the mouse)
        $value.attr('aria-describedby', 'fwds-default-description');
        $ctrl.append(window.$('<span id="fwds-default-description" class="fwds-srOnly"></span>')
            .text(_pk_translate('FeinwerkDashboardSegment_DashboardSegmentTooltip')));
        $ctrl.append($value);
        var $slot = window.$('#fwds-topcontrol-slot');
        if ($slot.length) { $slot.append($ctrl); } else { $area.before($ctrl.addClass('dashboardSegmentDefault--inline')); }
        // the icon where Matomo's own controls next to it have theirs: after the text on older Matomo 5 versions. Their
        // date selector's icon is measured where it shows (Matomo 6 floats it too, inside a flex row, where it stays first).
        try {
            var ref = document.querySelector('.periodSelector .title .icon');
            var refTitle = ref && ref.parentElement;
            if (ref && refTitle && ref.getBoundingClientRect) {
                var iconBox = ref.getBoundingClientRect();
                var titleBox = refTitle.getBoundingClientRect();
                if (iconBox.width > 0 && iconBox.left > titleBox.left + titleBox.width / 2) {
                    $ctrl.addClass('dashboardSegmentDefault--iconAfter');
                }
            }
        } catch (e) {
            // the icon stays first
        }
        if ($slot.length && $ctrl[0] && window.fwTopBar && typeof window.fwTopBar.register === 'function') {
            // first step: the short label (order 10); Feinwerk Dashboard Sharing's labels (20); last: no label (30)
            window.fwTopBar.register({
                el: $ctrl[0],
                order: 10,
                set: function (on) { $ctrl.toggleClass('dashboardSegmentDefault--short', !!on); }
            });
            if ($label[0]) {
                window.fwTopBar.register({
                    el: $label[0],
                    order: 30,
                    set: function (on) { $ctrl.toggleClass('dashboardSegmentDefault--compact', !!on); }
                });
            }
        }

        function render() {
            var label = self.defaultLabel();
            $name.text(label);
            // the full name first (a long one is cut with an ellipsis), then what the button is for
            $value.attr('title', _pk_translate('FeinwerkDashboardSegment_DashboardSegmentButton') + ' ' + label + '\n'
                + _pk_translate('FeinwerkDashboardSegment_DashboardSegmentTooltip'));
            $ctrl.toggleClass('dashboardSegmentDefault--set', !!self.settings.defaultAction);
            scheduleFit();
        }

        // a link with the role of a button also opens with the space bar
        $value.on('keydown', function (e) {
            if (e.key === ' ') { e.preventDefault(); $value.trigger('click'); }
        });
        $value.on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openSegmentMenu($value, self.currentDefaultValue(), function (value) {
                self.saveDefault(value).then(function (saved) {
                    if (!saved) { return; }
                    render();
                    // Changing the default drives the global segment live; only reload widgets
                    // ourselves when that did not already navigate (which reloads everything).
                    if (!self.syncGlobalSegmentForDashboard()) { self.reloadAllWidgets(); }
                });
            }, 'FeinwerkDashboardSegment_NoDashboardDefault', _pk_translate('FeinwerkDashboardSegment_DashboardDefaultSegment'), {
                newFor: function () { return 'default'; }
            });
        });

        self.loadSegments(function () { render(); });
    };

    window.FeinwerkDashboardSegment = FeinwerkDashboardSegment;

    // ---- read-only marker published by the Sharing plugin -----------------------------------

    // Subscribed (synced) dashboards are read-only. The Sharing plugin publishes that as the
    // `fwsh-readonly` class on #dashboardWidgetsArea and window.FeinwerkDashboardSharing.readOnly.
    function isReadOnlyDashboard() {
        return !!(window.FeinwerkDashboardSharing && window.FeinwerkDashboardSharing.readOnly)
            || window.$('#dashboardWidgetsArea').hasClass('fwsh-readonly');
    }
    FeinwerkDashboardSegment.isReadOnlyDashboard = isReadOnlyDashboard;

    // On a normal dashboard: (re)inject controls + apply overrides. On a read-only dashboard:
    // just apply the synced overrides.
    function applyAfterFetch() {
        if (isReadOnlyDashboard()) {
            // Subscribed dashboards also drive the global segment from their synced default.
            if (!FeinwerkDashboardSegment.syncGlobalSegmentForDashboard()
                && FeinwerkDashboardSegment.hasAnySettings()) {
                FeinwerkDashboardSegment.reloadAllWidgets();
            }
            return;
        }
        // a segment just made with "New segment" goes to its widget or the default first (B1)
        FeinwerkDashboardSegment.applyNewSegmentNote(function () {
            FeinwerkDashboardSegment.loadSegments(function () {
                FeinwerkDashboardSegment.injectDefaultControl();
                window.$('[widgetId]').each(function () { refreshBar(window.$(this)); });
            });
            // Drive Matomo's global segment from the dashboard default so reactive widgets honour it.
            // If that navigates, it reloads every widget itself; only fall back to our per-widget reload
            // when we did NOT navigate.
            if (!FeinwerkDashboardSegment.syncGlobalSegmentForDashboard()) {
                FeinwerkDashboardSegment.applyToRendered();
            }
        });
    }

    // Entry point for (re)entering a dashboard.
    function enterDashboard() {
        FeinwerkDashboardSegment.installWrapper();
        if (currentDashboardId() === null) {
            settingsRead++; // an answer still on its way belongs to the dashboard the user left
            FeinwerkDashboardSegment.restoreBaselineSegment(); // left all dashboards -> restore the user's segment
            return;
        }
        FeinwerkDashboardSegment.fetchSettings(applyAfterFetch);
    }

    window.$(function () {
        // Anonymous viewers (public dashboards) have nothing to load or save: every endpoint of this
        // plugin needs a signed-in user. Stay idle so the dashboard renders with its normal segment.
        if (!window.piwik || !window.piwik.userLogin || window.piwik.userLogin === 'anonymous') {
            return;
        }

        // Bind widget decoration FIRST so pickers are always added, independent of the fetch.
        // Also (idempotently) ensure the default control exists whenever widgets render.
        window.$(document).on('widget:create', function (e, widget) {
            if (!widget || !widget.uniqueId) { return; }
            markDashboardRendered(); // layout and widget list are loaded once widgets are created
            if (!isReadOnlyDashboard()) {
                FeinwerkDashboardSegment.injectDefaultControl();
            }
            FeinwerkDashboardSegment.loadSegments(function () { FeinwerkDashboardSegment.decorateWidget(widget); });
        });

        // The Sharing plugin determines read-only asynchronously. Work on elements only
        // (decorateWidget needs a Matomo widget object, which we do not have here).
        // The heavy rebuild below must only run on a genuine read-only -> editable transition
        // (leaving a shared dashboard), never when a normal editable dashboard is simply opened.
        var wasReadOnly = false;
        FeinwerkDashboardSegment.onReadOnlyChange = function () {
            if (isReadOnlyDashboard()) {
                wasReadOnly = true;
                // hide editing controls that were already rendered; the chips stay (read-only)
                window.$('.dashboardSegmentButton, .dashboardPeriodButton').remove();
                window.$('#dashboardSegmentDefault').remove();
                window.$('[widgetId]').each(function () { refreshBar(window.$(this)); });
                return;
            }
            if (!wasReadOnly) { return; }   // editable -> editable (normal open): nothing to do
            wasReadOnly = false;
            // Back to editable: reloading the dashboard re-fires widget:create for every widget
            // (object-based decorateWidget re-adds the pickers); the default control follows.
            var id = currentDashboardId();
            var $area = window.$('#dashboardWidgetsArea');
            forgetRenderedDashboard(); // the dashboard renders again
            try {
                if (id !== null && $area.length && typeof $area.dashboard === 'function') {
                    $area.dashboard('loadDashboard', id, true);
                }
            } catch (e) {
                if (window.console) { window.console.error('FeinwerkDashboardSegment dashboard reload failed', e); }
            }
            FeinwerkDashboardSegment.fetchSettings(applyAfterFetch);
        };
        window.$(document).on('fwsh:readonlychange', function () { FeinwerkDashboardSegment.onReadOnlyChange(); });

        // The Sharing plugin re-synced a subscribed copy on the server (layout and per-widget overrides)
        // and reloads it: the overrides read for this page are stale, read them again.
        FeinwerkDashboardSegment.onSynced = function (idDashboard) {
            var id = currentDashboardId();
            if (id === null || String(idDashboard) !== String(id)) { return; }
            var before = JSON.stringify(FeinwerkDashboardSegment.settings);
            forgetRenderedDashboard(); // the copy renders again; a global segment change waits for it
            FeinwerkDashboardSegment.fetchSettings(function () {
                var changed = JSON.stringify(FeinwerkDashboardSegment.settings) !== before;
                // Widgets created before the answer loaded with the old overrides, later ones use the new.
                var rendered = dashboardRendered();
                if (!FeinwerkDashboardSegment.syncGlobalSegmentForDashboard() && changed && rendered) {
                    FeinwerkDashboardSegment.reloadAllWidgets();
                }
                if (changed) {
                    FeinwerkDashboardSegment.loadSegments(function () {
                        window.$('[widgetId]').each(function () { refreshBar(window.$(this)); });
                    });
                }
            });
        };
        window.$(document).on('fwsh:synced', function (e, idDashboard) { FeinwerkDashboardSegment.onSynced(idDashboard); });

        enterDashboard();

        var lastContext = currentIdSite() + '|' + currentDashboardId();
        function onContextMaybeChanged() {
            var ctx = currentIdSite() + '|' + currentDashboardId();
            if (ctx === lastContext) { return; }
            lastContext = ctx;
            forgetRenderedDashboard(); // another dashboard (or site) is loading now
            FeinwerkDashboardSegment.segments = null;
            window.$('#dashboardSegmentDefault').remove();
            enterDashboard();
        }
        window.$(window).on('hashchange', onContextMaybeChanged);
        if (window.piwik && window.piwik.on) {
            window.piwik.on('Dashboard.loadDashboard', onContextMaybeChanged);
            window.piwik.on('Dashboard.Dashboard.mounted', markDashboardRendered);
        }
    });
})();
