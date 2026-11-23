# Changelog

## 6.0.0

The first stable version for Matomo 6. Compared with the last beta for Matomo 6 before the new version numbers
(1.0.0-beta.3):

- New version numbers: the plugin for Matomo 6 now carries version 6.x, the one for Matomo 5 version 5.x.
- The dashboard default segment is a button in the bar at the top, next to the date and Matomo's segment selection
  ("Dashboard segment: ..."), instead of a line above the widgets. Without a default its menu says "No default (segment
  chosen at the top)". It does not appear on subscribed, read-only dashboards.
- Each Matomo user keeps their own widget segments and time ranges on every database: logins are compared exactly, and
  an update stores them that way. Before, on some databases two users whose logins differ only in case (such as "Anna"
  and "anna", depending on the database also "ß" and "ss") could see, change or remove each other's settings on a
  dashboard with the same number. Settings stored under a login typed in another case move to that user.
- The plugin's API refuses invalid input (an empty widget, a date or time range Matomo cannot show, a website number of
  0) with an error (HTTP 400) instead of storing it, and a setting that belongs to another user with HTTP 409.
- Administration: while the free Feinwerk Connector is not active, super users find "Feinwerk Plugins", "Install
  Feinwerk Connector". One click installs it from the Matomo Marketplace and activates it, after Matomo's password
  check; where Matomo cannot install from its Marketplace, the page explains the manual way, and where plugin
  administration is switched off it shows the command that activates the connector. `connector_installer = 0` in
  `[FeinwerkDashboardSegment]` hides the entry.
- The plugin speaks French, Spanish and Italian as well as English and German.
- Fixed: when Feinwerk Dashboard Sharing is installed but not active, the hint for super users asks to activate it
  instead of installing it.
- The "New segment" link in the segment menu shows Matomo's plus icon; menu borders use Matomo 6's border colour.
- Documentation: the README has a section on privacy; the Matomo Marketplace page has new screenshots, a new cover and
  a working demo link.

## 1.0.0-beta.3

- Opening a dashboard with a default segment, or leaving it again, now loads each widget once when that changes the
  segment you see. Before, every widget was requested twice, which put extra load on the Matomo server.

## 1.0.0-beta.2

- Fixed: a segment you pick at the top while a dashboard is still loading now stays. Before, the dashboard default (or
  your previous segment) could replace it once the dashboard had loaded.
- Fixed: when you open a shared dashboard you subscribed to, changes the owner made to the segment or time range of a
  widget now show right away, not only after reloading the page. Needs Feinwerk Dashboard Sharing 2.0.0-beta.1 or later.
- Fixed: removing a dashboard now also removes its segments and time ranges. Before, a dashboard you created later
  could take them over.
- Fixed: when you leave a dashboard with a default segment for a goal page, your previous segment comes back.

## 1.0.0-beta.1

- Works with Matomo 6. For Matomo 5, version 0.x stays available and is maintained in parallel.
- Fixed: opening a dashboard with a dashboard default segment could leave the dashboard empty. The default segment is now
  applied once the dashboard has loaded.
- Fixed: when a segment or time range cannot be saved, only the plugin's own notification appears (no second, generic
  error box and no error in the browser console).
- If a change was saved but the dashboard could not be updated, a notification asks you to reload the page.
- The "Dashboard default segment" control now sits in Matomo's own place above the widgets.
- The segment and time range buttons in a widget header are spaced and coloured like Matomo's own widget buttons.
- Values sent to the plugin's API with leading or trailing spaces are stored without them.

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
