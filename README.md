# Feinwerk Dashboard Segment

Choose and persist a **Matomo segment per dashboard widget**, with a dashboard-wide default
that individual widgets can override or opt out of.

Matomo's dashboards only support **one global segment** applied to every widget at once. That
makes mixed dashboards impossible, for example an "LLM / AI analysis" dashboard where most widgets
should use an *AI Referrer* segment, but the AI‑chatbot widgets must show **all** data (they have
no AI referrer by definition). Feinwerk Dashboard Segment fixes that.

> Dashboard sharing is now a separate free plugin, **Feinwerk Dashboard Sharing**. Install it if you want
> to share dashboards.

## Description

Matomo dashboards apply one segment and one time range to every widget. Feinwerk Dashboard Segment gives each
widget its own, so a single dashboard can compare audiences and periods side by side.

**What you can do**

- **A segment per widget:** open the segment menu in the widget header and choose any saved segment of the website.
  A search field helps with long lists, and "New segment" opens Matomo's segment editor.
- **A time range per widget:** give a widget a period of its own: today, yesterday, the last 7 or 30 days, this week,
  this month or this year, independent of the date chosen for the dashboard.
- **The same report twice:** add a widget twice and give each copy its own segment, for example all visits next to
  mobile visitors.
- **One default for the whole dashboard:** a segment chosen with the "Dashboard segment" button in the bar at the top,
  next to the date, filters the entire dashboard. Single widgets can keep a segment of their own or show all data.
- **Always visible:** a small bar under the widget title shows the active segment and time range; "×" removes them.
- **Remembered:** choices are stored per user, dashboard and website and come back every time the dashboard opens.

**Which widgets support it:** report tables (for example Channel Types, Pages or Countries) get their own segment and
time range. Graphs, sparklines, overview and real-time widgets, the Visitor Map and widgets of other plugins that load
their data in the browser follow the dashboard default segment instead and show no buttons.

**Get started:** open a dashboard and use the segment button in a widget header.

**Nothing changes until you choose.** Without a choice, dashboards behave exactly like standard Matomo, and public
dashboards for anonymous visitors keep working as before. Shared dashboards of Feinwerk Dashboard Sharing take the
segments and time ranges along.

Works with Feinwerk Dashboard Sharing (free): share a dashboard, and your colleagues get its segments too.

**More Plugins for Matomo by Feinwerk:** install [Feinwerk Connector](https://plugins.matomo.org/FeinwerkMarketplaceConnector)
from the Matomo Marketplace to discover, install and update all Feinwerk plugins, free and paid, right in your Matomo.
Documentation: [plugins.feinwerk.io](https://plugins.feinwerk.io/en/plugins/FeinwerkDashboardSegment).

## Features

- **Per‑widget segment**: pick a saved segment for any individual widget from a control in its
  header.
- **Dashboard default**: set one default segment for the whole dashboard; widgets inherit it.
- **Three states per widget**: inherit the default · a specific segment · **No segment (all data)**,
  which wins even over a dashboard default.
- **Per instance**: the *same* widget can appear twice on a dashboard with *different* segments
  (useful for side‑by‑side comparison).
- **Per site**: segments are chosen and applied separately for each site; only the current site's
  saved segments are offered and applied.
- **Per‑widget time range**: optionally give a widget its own period/date (e.g. *Last 30 days* or
  *Yesterday*) independent of the dashboard's range.
- A small **bar under the widget header** shows the active segment and time range, each with a **×**
  to remove it (back to the dashboard default / the dashboard time range).

Precedence: `per‑widget override (server‑rendered widgets)  >  dashboard default (= the dashboard's global segment)  >  the segment you had before`.

## How it works

The plugin only adds to Matomo. It does not change Matomo's own files or the bundled Dashboard
plugin, so Matomo updates keep working:

- Each widget on a dashboard remembers its own segment and time range. If you add the same widget
  twice, each copy keeps its own choice.
- A **dashboard default** sets Matomo's normal segment while the dashboard is open, without
  reloading the page, so every widget follows it, including graphs and the Live! widget. When you
  leave the dashboard, the segment you had before comes back.
- Your choices are stored per user, dashboard and website in the plugin's own database table
  `dashboard_widget_settings`.
- The picker lists the saved segments of Matomo's segment editor.

To create a **new** segment (e.g. *AI Referrer*), use Matomo's normal segment editor once; it then
appears in the per‑widget picker.

## Requirements

- Matomo 5.x
- PHP 8.1 or newer
- The bundled **Dashboard** and **SegmentEditor** plugins (active by default).

Available in English, German, French, Spanish and Italian.

Matomo 6: version 6.x. Matomo 5: version 5.x.

## Installation

1. Copy this folder to `plugins/FeinwerkDashboardSegment` in your Matomo installation.
2. Activate it: **Administration → Plugins →** `FeinwerkDashboardSegment` **→ Activate**, or on the CLI:
   ```
   ./console plugin:activate FeinwerkDashboardSegment
   ./console core:clear-caches
   ```
   Activation creates the `dashboard_widget_settings` table.

### Upgrading from `DashboardSegment`

Up to version 0.4 this plugin was called `DashboardSegment`. Install and activate
`FeinwerkDashboardSegment`: it takes over all widget segments and removes the old plugin automatically.
Do not uninstall `DashboardSegment` yourself.

## Usage

1. Open a dashboard.
2. Use the **segment button** in a widget's header to pick a segment, "No segment (all data)", or
   "Use dashboard default". The calendar button next to it gives the widget a time range of its own.
3. Use the **Dashboard segment** button in the bar at the top, next to the date, to set a default for the whole
   dashboard.
4. Switch sites to manage each site's selection independently.

## API

Everything the buttons do is also available through Matomo's HTTP API (module `FeinwerkDashboardSegment`), for
scripts and AI assistants. Every call works on the calling user's own dashboards and needs view access to the website.
A widget is addressed by its instance id, the value `dsSegId` that the plugin stores in the widget's parameters in the
dashboard layout (`Dashboard.getDashboards`). `idDashboard` is the dashboard number from `Dashboard.getDashboards`.

Read the settings of a dashboard (its default segment and each widget's own segment and time range):

    index.php?module=API&method=FeinwerkDashboardSegment.getWidgetSettings&idDashboard=1&idSite=1&format=json&token_auth=...

Give a widget a segment of its own (`__none__` shows it without any segment, an empty value lets it follow the
dashboard again):

    index.php?module=API&method=FeinwerkDashboardSegment.setWidgetSegment&idDashboard=1&idSite=1&widgetUniqueId=imwtkmv6645rkow&segment=deviceType%3D%3Dsmartphone&format=json&token_auth=...

Give a widget a time range of its own (`period` day, week, month, year or range; `date` today, yesterday or
YYYY-MM-DD, for range lastN, previousN or two dates separated by a comma; an empty `period` removes it):

    index.php?module=API&method=FeinwerkDashboardSegment.setWidgetPeriod&idDashboard=1&idSite=1&widgetUniqueId=imwtkmv6645rkow&period=range&date=last30&format=json&token_auth=...

Set the segment a dashboard opens with (`__none__` for all data, an empty value removes it):

    index.php?module=API&method=FeinwerkDashboardSegment.setDashboardDefaultSegment&idDashboard=1&idSite=1&segment=deviceType%3D%3Dsmartphone&format=json&token_auth=...

Invalid values answer with HTTP 400 and name the parameter; a setting that belongs to another user answers with
HTTP 409. The saved segments to choose from come from Matomo's own `SegmentEditor.getAll`.

## Known limitations / roadmap

- **A dashboard default filters the whole dashboard**, including reactive / live widgets
  (evolution graphs, KPI / single‑metric widgets, sparklines, the **Live!** widget, the visitor
  map). Opening a dashboard whose default is a segment activates that segment as Matomo's **global**
  segment (it also shows in the native segment selector) and restores your previous segment when you
  leave the dashboard. A manual change to the global segment while you are on the dashboard wins
  until you reopen it. What remains impossible for an additive plugin is a **per‑widget** segment
  *exception* on those reactive widgets: they follow the dashboard default, so their per‑widget
  pickers stay hidden. Per‑widget overrides still apply to the standard server‑rendered report
  widgets (the majority).
- Planned: bulk segment assignment.

## Installing the Feinwerk Connector

The free Feinwerk Connector installs, updates and licenses Feinwerk plugins inside Matomo. The easiest way to get it is
the Matomo Marketplace. While it is not active, super users also find a section "Feinwerk Plugins" in Matomo's
Administration with the entry "Install Feinwerk Connector" ("Activate Feinwerk Connector" when its files are already
there). One click installs it from the Matomo Marketplace and activates it; as with every plugin install, Matomo first
asks for your password. Where Matomo cannot install from its Marketplace (Marketplace, internet features or plugin
administration switched off), the page explains the manual way instead. In Matomo for WordPress the connector is
installed as a WordPress plugin through Matomo Analytics, Marketplace. The connector needs PHP 8.1. Nothing is
downloaded before you click. To hide the entry, add to `config/config.ini.php`:

    [FeinwerkDashboardSegment]
    connector_installer = 0

The same line in the section `[FeinwerkMarketplaceConnector]` hides it for all Feinwerk plugins.

## Privacy

- The plugin stores only what you choose in its controls: per Matomo user, dashboard and website the segment and time
  range of a widget and the default segment of the dashboard. It stores no visitor data of its own.
- Nothing leaves your Matomo: the plugin loads nothing from other servers, sends no data anywhere and shows no
  advertising or feedback questions.
- Removing a dashboard, a website or a Matomo user removes the settings that belong to it. Uninstalling the plugin
  removes its table.

## License

GPL v3 or later.

## Author

Peter Boehlke, [Feinwerk.io](https://feinwerk.io) · support@feinwerk.io
