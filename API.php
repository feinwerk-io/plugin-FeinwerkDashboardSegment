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
 * FeinwerkDashboardSegment API: per-widget segment and period/date overrides plus a per-dashboard default
 * segment (per site). All methods operate on the caller's own dashboards.
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
     * Set (or clear) the segment override for a single widget instance, for a specific site.
     * '' clears the override; SegmentResolver::NONE forces "no segment / all data".
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
     * Set (or clear) the period/date override for a single widget instance, for a specific site.
     * Pass empty $period to clear (the widget then inherits the dashboard's period/date).
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
     * Set (or clear) the dashboard-wide default segment for a specific site.
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
     * @return array{default: ?string, widgets: array<string,array{segment:?string,period:?string,date:?string}>}
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
