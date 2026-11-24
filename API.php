<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment;

use Piwik\Piwik;
use Piwik\Plugins\FeinwerkDashboardSegment\Dao\WidgetSettings;
use Piwik\Plugins\FeinwerkDashboardSegment\Exception\InvalidRequestException;

/**
 * FeinwerkDashboardSegment API: a segment and a time range of its own for single dashboard widgets, and one default
 * segment per dashboard, stored per Matomo user, dashboard and website. Every method works on the calling user's own
 * dashboards only (view access to the website is required).
 *
 * Widgets are addressed by the plugin's instance id (`widgetUniqueId`): the value `dsSegId` that the plugin stores in
 * the widget's parameters in the dashboard layout (Dashboard.getDashboards), not Matomo's widget uniqueId, so the same
 * report can appear twice with different settings.
 *
 * @method static API getInstance()
 */
class API extends \Piwik\Plugin\API
{
    /** the periods a widget can be given; the date must suit the period (see assertPeriodAndDate) */
    private const PERIODS = array('day', 'week', 'month', 'year', 'range');

    /** @var WidgetSettings */
    private $dao;

    public function __construct(?WidgetSettings $dao = null)
    {
        $this->dao = $dao ?: new WidgetSettings();
    }

    /**
     * Gives one dashboard widget a segment of its own, shows it without any segment, or lets it follow the dashboard again.
     *
     * Use it to filter a single report on a dashboard (for example "mobile visitors" next to the same report for all
     * visits). Only report tables honour it; graphs and real-time widgets follow the dashboard's segment.
     *
     * @param int $idDashboard the dashboard number of the calling user (iddashboard of Dashboard.getDashboards)
     * @param int $idSite the website (idsite, greater than 0)
     * @param string $widgetUniqueId the widget's instance id (`dsSegId` in its parameters in the dashboard layout); not empty
     * @param string $segment a Matomo segment definition (for example "deviceType==smartphone"), "__none__" for no
     *        segment (all data, also when the dashboard has a default), or "" to remove the widget's own setting so it
     *        follows the dashboard default again
     * @return void nothing; read the stored state with getWidgetSettings
     * @throws \Exception HTTP 400 when widgetUniqueId is empty or idSite is not positive, 409 when the setting belongs to
     *         another user
     */
    public function setWidgetSegment(int $idDashboard, int $idSite, string $widgetUniqueId, string $segment): void
    {
        $login = $this->checkAndGetLogin($idSite);
        // Matomo 6 no longer trims request parameters; a value of only spaces clears like ''.
        $widgetUniqueId = $this->requireWidgetId($widgetUniqueId);
        $segment = trim($segment);

        if ($segment === '') {
            $this->dao->clearSegment($login, $idDashboard, $idSite, $widgetUniqueId);
            return;
        }
        $this->dao->setSegment($login, $idDashboard, $idSite, $widgetUniqueId, $segment);
    }

    /**
     * Gives one dashboard widget a time range of its own, or lets it follow the dashboard's date and period again.
     *
     * Use it to show a single report for a fixed time range (for example the last 30 days) while the rest of the dashboard
     * follows the date chosen at the top. Relative dates count from today in the website's time zone.
     *
     * @param int $idDashboard the dashboard number of the calling user (iddashboard of Dashboard.getDashboards)
     * @param int $idSite the website (idsite, greater than 0)
     * @param string $widgetUniqueId the widget's instance id (`dsSegId` in its parameters in the dashboard layout); not empty
     * @param string $period one of "day", "week", "month", "year", "range", or "" to remove the widget's own time range
     * @param string $date for day, week, month and year: "today", "yesterday" or YYYY-MM-DD; for range: "lastN",
     *        "previousN" (N days, for example "last30") or "YYYY-MM-DD,YYYY-MM-DD" (start not after end); ignored when
     *        period is ""
     * @return void nothing; read the stored state with getWidgetSettings
     * @throws \Exception HTTP 400 when period or date is not one of the allowed forms, widgetUniqueId is empty or idSite is
     *         not positive, 409 when the setting belongs to another user
     */
    public function setWidgetPeriod(int $idDashboard, int $idSite, string $widgetUniqueId, string $period, string $date): void
    {
        $login = $this->checkAndGetLogin($idSite);
        $widgetUniqueId = $this->requireWidgetId($widgetUniqueId);
        $period = trim($period);
        $date = trim($date);

        if ($period === '') {
            $this->dao->clearPeriod($login, $idDashboard, $idSite, $widgetUniqueId);
            return;
        }
        $this->assertPeriodAndDate($period, $date);
        $this->dao->setPeriod($login, $idDashboard, $idSite, $widgetUniqueId, $period, $date);
    }

    /**
     * Sets the segment a dashboard opens with for one website, or removes it.
     *
     * Use it to filter a whole dashboard (also its graphs, sparklines and real-time widgets): while the dashboard is open
     * the segment becomes Matomo's segment at the top, and widgets without a segment of their own follow it.
     *
     * @param int $idDashboard the dashboard number of the calling user (iddashboard of Dashboard.getDashboards)
     * @param int $idSite the website (idsite, greater than 0)
     * @param string $segment a Matomo segment definition (for example "deviceType==smartphone"), "__none__" to open the
     *        dashboard without any segment (all data), or "" to remove the default (the dashboard keeps the segment chosen
     *        at the top)
     * @return void nothing; read the stored state with getWidgetSettings
     * @throws \Exception HTTP 400 when idSite is not positive, 409 when the setting belongs to another user
     */
    public function setDashboardDefaultSegment(int $idDashboard, int $idSite, string $segment): void
    {
        $login = $this->checkAndGetLogin($idSite);
        $segment = trim($segment);

        if ($segment === '') {
            $this->dao->clearSegment($login, $idDashboard, $idSite, SegmentResolver::DEFAULT_WIDGET_ID);
            return;
        }
        $this->dao->setSegment($login, $idDashboard, $idSite, SegmentResolver::DEFAULT_WIDGET_ID, $segment);
    }

    /**
     * Returns the stored settings of one dashboard for one website: its default segment and each widget's own settings.
     *
     * Use it before changing settings, or to explain what a dashboard shows. Widgets without settings of their own are
     * not listed; they follow the default segment and the dashboard's date and period.
     *
     * @param int $idDashboard the dashboard number of the calling user (iddashboard of Dashboard.getDashboards)
     * @param int $idSite the website (idsite, greater than 0)
     * @return array{default: ?string, widgets: array<string,array{segment:?string,period:?string,date:?string}>}
     *         `default`: the dashboard's default segment (a definition, "__none__" for all data) or null when none is set;
     *         `widgets`: keyed by widget instance id, each with `segment` (a definition, "__none__" for all data, or null
     *         when it follows the default), `period` and `date` (as accepted by setWidgetPeriod, or null when it follows
     *         the dashboard)
     * @throws \Exception HTTP 400 when idSite is not positive
     */
    public function getWidgetSettings(int $idDashboard, int $idSite): array
    {
        $login = $this->checkAndGetLogin($idSite);

        $all = $this->dao->getAllForDashboard($login, $idDashboard, $idSite);

        $default = null;
        if (array_key_exists(SegmentResolver::DEFAULT_WIDGET_ID, $all)) {
            $default = $all[SegmentResolver::DEFAULT_WIDGET_ID]['segment'];
            unset($all[SegmentResolver::DEFAULT_WIDGET_ID]);
        }

        return array('default' => $default, 'widgets' => $all);
    }

    /** The trimmed widget instance id; an empty one answers HTTP 400. */
    private function requireWidgetId(string $widgetUniqueId): string
    {
        $widgetUniqueId = trim($widgetUniqueId);
        if ($widgetUniqueId === '') {
            throw new InvalidRequestException('widgetUniqueId must not be empty');
        }
        return $widgetUniqueId;
    }

    /**
     * A period override must be one Matomo can show: day, week, month or year with a single date (today, yesterday or
     * YYYY-MM-DD), or range with lastN, previousN or "YYYY-MM-DD,YYYY-MM-DD". Anything else answers HTTP 400 instead of
     * being stored and breaking the widget later.
     */
    private function assertPeriodAndDate(string $period, string $date): void
    {
        if (!in_array($period, self::PERIODS, true)) {
            throw new InvalidRequestException('Invalid period: use day, week, month, year or range');
        }
        $single = '\\d{4}-\\d{2}-\\d{2}';
        $pattern = $period === 'range'
            ? '/^(?:(?:last|previous)[1-9]\\d{0,3}|' . $single . ',' . $single . ')$/'
            : '/^(?:today|yesterday|' . $single . ')$/';
        if (!preg_match($pattern, $date)) {
            throw new InvalidRequestException('Invalid date for period ' . $period);
        }
        // calendar dates must exist, and a custom range must not end before it starts
        preg_match_all('/(\\d{4})-(\\d{2})-(\\d{2})/', $date, $days, PREG_SET_ORDER);
        foreach ($days as $day) {
            if (!checkdate((int) $day[2], (int) $day[3], (int) $day[1])) {
                throw new InvalidRequestException('Invalid date for period ' . $period);
            }
        }
        if (count($days) === 2 && strcmp($days[0][0], $days[1][0]) > 0) {
            throw new InvalidRequestException('The range ends before it starts');
        }
    }

    /** Test seam: unit tests replace the access check, which needs Matomo's container. */
    protected function checkAndGetLogin(int $idSite): string
    {
        Piwik::checkUserIsNotAnonymous();
        // Reject idSite <= 0 explicitly: checkUserHasViewAccess(0) throws for normal users but passes
        // for superusers, who would then read/write overrides under the bucket idsite=0 that no real
        // dashboard load ever matches.
        if ($idSite <= 0) {
            throw new InvalidRequestException('Invalid idSite');
        }
        Piwik::checkUserHasViewAccess($idSite);
        return Piwik::getCurrentUserLogin();
    }
}
