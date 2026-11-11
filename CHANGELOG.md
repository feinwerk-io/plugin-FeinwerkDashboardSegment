# Changelog

## 5.0.1

- Fixed: when Feinwerk Dashboard Sharing is installed but not active, the hint for super users asks to activate it
  instead of installing it.
- Removed again: the feedback question below the dashboard default segment and the tips from Feinwerk (the line below
  the default segment, the banner on the start page of the administration and the boxes on the Campaigns, Ecommerce
  overview and Goals overview reports) that 5.0.0 added.

## 5.0.0

- New: below the dashboard default segment you can tell us with thumbs up or down whether your widgets show the right
  segment, and "Support" opens the Feinwerk contact form. Your Matomo server sends the answer with the plugin and Matomo
  version, the browser and the interface language, nothing else. `feedback = 0` in `[FeinwerkDashboardSegment]` switches
  it off.
- New: tips from Feinwerk for admins and super users: one line below the dashboard default segment, one banner on the
  start page of the administration and one box at the end of the Campaigns, Ecommerce overview and Goals overview
  reports. "×" hides a tip for 30 days; nothing is loaded from outside. `promotions = 0` in
  `[FeinwerkDashboardSegment]` switches them off, in `[FeinwerkMarketplaceConnector]` for all Feinwerk plugins.
- Version numbers now follow Matomo: 5.x for Matomo 5 (this release follows 0.7.2), 6.x for Matomo 6.
- Needs PHP 8.1 or newer, like the other Feinwerk plugins.

## 0.7.2

- Opening a dashboard with a default segment, or leaving it again, now loads each widget once when that changes the
  segment you see. Before, every widget was requested twice, which put extra load on the Matomo server.

## 0.7.1

- Fixed: a segment you pick at the top while a dashboard is still loading now stays. Before, the dashboard default (or
  your previous segment) could replace it once the dashboard had loaded.
- Fixed: when you open a shared dashboard you subscribed to, changes the owner made to the segment or time range of a
  widget now show right away, not only after reloading the page. Needs Feinwerk Dashboard Sharing 1.0.3 or later.
- Fixed: removing a dashboard now also removes its segments and time ranges. Before, a dashboard you created later
  could take them over.
- Fixed: going from a dashboard with a default segment to a goal page could keep the dashboard's segment.
- Fixed: opening a dashboard with a dashboard default segment could leave the dashboard empty. The default segment is now
  applied once the dashboard has loaded.
- Fixed: when a segment or time range cannot be saved, only the plugin's own notification appears (no second, generic
  error box and no error in the browser console).
- If a change was saved but the dashboard could not be updated, a notification asks you to reload the page.
- The segment and time range buttons in a widget header are spaced and coloured like Matomo's own widget buttons.
- From Matomo 5.14.1 on, the "Dashboard default segment" control sits in Matomo's own place above the widgets.

## 0.7.0

- Dashboard sharing has moved to the separate free plugin Feinwerk Dashboard Sharing. Install it to keep
  sharing. No change to the segmentation features or your data.

## 0.6.0

- A dashboard-wide default segment now filters the WHOLE dashboard, including evolution graphs, KPI
  and sparkline widgets, the Live! widget and the visitor map: opening a dashboard whose default is a
  segment activates that segment (it also shows in the global segment selector) and restores your
  previous segment when you leave. Per-widget overrides still apply to server-rendered report/table
  widgets; a manual change to the global segment on the dashboard wins until you reopen it.

## 0.5.4

- Fixed: the per-widget segment/time-range buttons disappeared on Matomo 5.14, which moved the
  dashboard widget header to a new Vue component. The buttons are now placed in the new header
  (with a fallback to the old header on Matomo 5.13 and earlier).
- The segment picker is now searchable (type to filter the segments) and has a "New segment" entry
  that opens Matomo's segment editor, for both the per-widget picker and the dashboard default.
- Dark mode: all plugin controls (segment and time-range pickers, the menus, the share dialog,
  chips and the "synced" banner) now follow Matomo's theme and are legible in dark mode.
- Fixed: a dashboard you had shared is no longer offered or synced after you delete it (its share is
  removed automatically), so a later dashboard reusing that id can't inherit the old share.
- Fixed: subscribing to the same shared dashboard twice (e.g. a double-click) no longer creates a
  duplicate copy.
- Per-site widget overrides are now removed when a website is deleted.
- Failed actions (saving a segment/time range, sharing, subscribing) now show a clear notification
  instead of failing silently.

## 0.5.3

- German translation: in a German Matomo all controls of the plugin (segment and time range pickers,
  dashboard default, sharing) are now shown in German.

## 0.5.2

- Fixed: on dashboards shown to anonymous visitors (public dashboards), an error box appeared because the
  plugin tried to load settings that require a login. The plugin now stays inactive for anonymous visitors.
- Prepared for the Matomo Marketplace: English description, FAQ and screenshots.

## 0.5.1

- Fixed: installing the plugin could fail with an SQL error on Matomo databases without a table prefix.

## 0.5.0

- The plugin is now published by Feinwerk.io and has been renamed from `DashboardSegment` to
  `FeinwerkDashboardSegment`.
- Upgrading: install and activate `FeinwerkDashboardSegment`. It takes over all widget segments,
  periods and shared dashboards and removes the old plugin automatically.
