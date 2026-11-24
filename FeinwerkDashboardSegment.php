<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment;

use Piwik\Common;
use Piwik\Db;
use Piwik\Notification;
use Piwik\Piwik;
use Piwik\Plugin;
use Piwik\Plugins\UsersManager\Model as UsersModel;

class FeinwerkDashboardSegment extends Plugin
{
    public function registerEvents()
    {
        return array(
            'AssetManager.getJavaScriptFiles'        => 'getJsFiles',
            'AssetManager.getStylesheetFiles'        => 'getStylesheetFiles',
            'Translate.getClientSideTranslationKeys' => 'getClientSideTranslationKeys',
            'Db.getTablesInstalled'                  => 'getTablesInstalled',
            'UsersManager.deleteUser'                => 'deleteUser',
            'SitesManager.deleteSite.end'            => 'deleteSite',
            'Controller.CoreHome.index'              => 'notifySharingMoved',
            'PluginManager.pluginActivated'          => 'onPluginActivated',
            // after Matomo's own segment selector, which uses the same event
            'Template.nextToCalendar'                => array('function' => 'renderTopControlSlot', 'after' => true),
            'FeinwerkDashboardSharing.copyWidgetOverrides'   => 'onCopyWidgetOverrides',
            'FeinwerkDashboardSharing.deleteWidgetOverrides' => 'onDeleteWidgetOverrides',
            'API.Dashboard.removeDashboard.end'           => 'onDashboardRemoved',
            'API.Dashboard.createNewDashboardForUser.end' => 'onDashboardCreated',
            'API.Dashboard.copyDashboardToUser.end'       => 'onDashboardCopied',
        );
    }

    /**
     * Hint for super users: dashboards were shared with the old built-in feature, but the new
     * FeinwerkDashboardSharing plugin is not active. Never allowed to break page rendering.
     */
    public function notifySharingMoved()
    {
        try {
            if (!Piwik::hasUserSuperUserAccess()) {
                return;
            }
            $manager = Plugin\Manager::getInstance();
            if ($manager->isPluginActivated('FeinwerkDashboardSharing')) {
                return;
            }
            try {
                $count = (int) Db::fetchOne('SELECT COUNT(*) FROM ' . Common::prefixTable('shared_dashboard'));
            } catch (\Exception $e) {
                $count = 0; // table does not exist (fresh install)
            }
            $key = self::sharingNotice(false, $manager->isPluginInstalled('FeinwerkDashboardSharing'), $count);
            if ($key === null) {
                return;
            }
            $notification = new Notification(Piwik::translate($key));
            $notification->context = Notification::CONTEXT_INFO;
            $notification->type = Notification::TYPE_PERSISTENT;
            $notification->flags = Notification::FLAG_CLEAR;
            Notification\Manager::notify('FeinwerkDashboardSegment_SharingMoved', $notification);
        } catch (\Throwable $e) {
            // A hint must never prevent the UI from loading.
        }
    }

    /**
     * Which hint the super user gets about dashboard sharing (translation key), null for none. Pure.
     * Installed but not active (e.g. switched off by Matomo during an update): activate it. Not installed: install it.
     */
    public static function sharingNotice(bool $sharingActivated, bool $sharingInstalled, int $shares): ?string
    {
        if ($sharingActivated || $shares < 1) {
            return null;
        }

        return $sharingInstalled ? 'FeinwerkDashboardSegment_SharingInactiveNotice' : 'FeinwerkDashboardSegment_SharingMovedNotice';
    }

    /**
     * A place in Matomo's bar at the top (website, date, segment, Manage Dashboard), right after the segment selector.
     * While an editable dashboard is shown, the script puts the dashboard default segment button into it; elsewhere it
     * stays empty (display: contents, so it takes no room). Where the bar is missing, the script puts the button above
     * the widgets instead.
     */
    public function renderTopControlSlot(&$out)
    {
        $out .= '<div id="fwds-topcontrol-slot" class="fwds-topControlSlot"></div>';
    }

    public function getJsFiles(&$jsFiles)
    {
        $jsFiles[] = 'plugins/FeinwerkDashboardSegment/javascripts/fwtopbar.js';
        $jsFiles[] = 'plugins/FeinwerkDashboardSegment/javascripts/dashboardSegment.js';
        $jsFiles[] = 'plugins/FeinwerkDashboardSegment/javascripts/connectorinstaller.js';
    }

    public function getStylesheetFiles(&$stylesheets)
    {
        $stylesheets[] = 'plugins/FeinwerkDashboardSegment/stylesheets/dashboardSegment.less';
        $stylesheets[] = 'plugins/FeinwerkDashboardSegment/stylesheets/connectorinstaller.css';
    }

    public function getClientSideTranslationKeys(&$keys)
    {
        $keys[] = 'FeinwerkDashboardSegment_PickSegment';
        $keys[] = 'FeinwerkDashboardSegment_InheritDefault';
        $keys[] = 'FeinwerkDashboardSegment_NoDashboardDefault';
        $keys[] = 'FeinwerkDashboardSegment_NoSegment';
        $keys[] = 'FeinwerkDashboardSegment_DashboardDefaultSegment';
        $keys[] = 'FeinwerkDashboardSegment_DashboardSegmentButton';
        $keys[] = 'FeinwerkDashboardSegment_NoDashboardDefaultShort';
        $keys[] = 'FeinwerkDashboardSegment_DashboardSegmentTooltip';
        $keys[] = 'FeinwerkDashboardSegment_CustomSegment';
        $keys[] = 'FeinwerkDashboardSegment_RemoveSegment';
        $keys[] = 'FeinwerkDashboardSegment_PickPeriod';
        $keys[] = 'FeinwerkDashboardSegment_InheritPeriod';
        $keys[] = 'FeinwerkDashboardSegment_RemovePeriod';
        $keys[] = 'FeinwerkDashboardSegment_NoMatchingSegment';
        $keys[] = 'FeinwerkDashboardSegment_NoSavedSegments';
        $keys[] = 'FeinwerkDashboardSegment_DashboardSegmentButtonShort';
        $keys[] = 'FeinwerkDashboardSegment_AddCopyWithSegment';
        $keys[] = 'FeinwerkDashboardSegment_SegmentForCopy';
        $keys[] = 'FeinwerkDashboardSegment_NewSegmentForWidget';
        $keys[] = 'FeinwerkDashboardSegment_NewSegmentIsDefault';
        $keys[] = 'FeinwerkDashboardSegment_CopyAdded';
        $keys[] = 'General_DateRangeFromTo';
        $keys[] = 'FeinwerkDashboardSegment_PeriodToday';
        $keys[] = 'FeinwerkDashboardSegment_PeriodYesterday';
        $keys[] = 'FeinwerkDashboardSegment_PeriodLast7';
        $keys[] = 'FeinwerkDashboardSegment_PeriodLast30';
        $keys[] = 'FeinwerkDashboardSegment_PeriodWeek';
        $keys[] = 'FeinwerkDashboardSegment_PeriodMonth';
        $keys[] = 'FeinwerkDashboardSegment_PeriodYear';
        $keys[] = 'FeinwerkDashboardSegment_SaveError';
        $keys[] = 'FeinwerkDashboardSegment_SavedReloadHint';
        $keys[] = 'FeinwerkDashboardSegment_NewSegment';
        $keys[] = 'FeinwerkDashboardSegment_SearchSegments';
    }

    public function getTablesInstalled(&$allTablesInstalled)
    {
        $allTablesInstalled[] = Common::prefixTable('dashboard_widget_settings');
    }

    public function install()
    {
        (new PredecessorTakeover())->migrateData();
        (new Dao\WidgetSettings())->install();
    }

    public function onPluginActivated($pluginName)
    {
        if ($pluginName === $this->getPluginName()) {
            (new PredecessorTakeover())->retirePredecessor();
        }
    }

    /**
     * The shared_dashboard* tables are owned by the FeinwerkDashboardSharing plugin and are
     * deliberately left in place here.
     */
    public function uninstall()
    {
        (new Dao\WidgetSettings())->uninstall();
    }

    /**
     * The deleted user's overrides. The event may carry the login in another case than the stored one, and the table may
     * match another user's login as well: delete the rows stored exactly under this login, or under a login that resolves
     * to no Matomo user (anymore) or to the deleted user; rows of a login that resolves to another existing user stay.
     */
    public function deleteUser($userLogin)
    {
        $userLogin = (string) $userLogin;
        $dao = $this->getWidgetSettingsDao();
        foreach ($dao->storedLoginsMatching($userLogin) as $stored) {
            if ($stored === $userLogin) {
                $dao->deleteAllForUser($stored);
                continue;
            }
            // another spelling the table matches: its rows go only if it is no user (anymore) or the deleted user
            $canonical = $this->canonicalLogin($stored);
            if ($canonical === '' || $canonical === $userLogin) {
                $dao->deleteAllForUser($stored);
            }
        }
    }

    /**
     * Posted by FeinwerkDashboardSharing when a subscriber's dashboard is (re-)synced: replace the
     * target's widget overrides with a copy of the source's.
     */
    public function onCopyWidgetOverrides($fromLogin, $fromIdDashboard, $toLogin, $toIdDashboard)
    {
        $fromLogin = $this->resolveLogin($fromLogin);
        $toLogin = $this->resolveLogin($toLogin);
        $dao = $this->getWidgetSettingsDao();
        $dao->deleteForDashboard($toLogin, $toIdDashboard);  // re-sync: replace the target's overrides
        $dao->copyForDashboard($fromLogin, $fromIdDashboard, $toLogin, $toIdDashboard);
    }

    /** Posted by FeinwerkDashboardSharing when a linked dashboard goes away. */
    public function onDeleteWidgetOverrides($login, $idDashboard)
    {
        $this->getWidgetSettingsDao()->deleteForDashboard($this->resolveLogin($login), $idDashboard);
    }

    /** Matomo's "Remove dashboard": the dashboard's overrides go with it. */
    public function onDashboardRemoved(&$returnedValue, $extraInfo)
    {
        $parameters = isset($extraInfo['parameters']) ? $extraInfo['parameters'] : array();
        $login = !empty($parameters['login']) ? $this->resolveLogin($parameters['login']) : $this->getCurrentLogin();
        $this->deleteOverridesOf($login, isset($parameters['idDashboard']) ? $parameters['idDashboard'] : 0);
    }

    /**
     * Matomo gives a new dashboard the highest free id of its user, so overrides left under that id
     * (a dashboard removed while this plugin was inactive, or before it removed them) would reach it.
     */
    public function onDashboardCreated(&$returnedValue, $extraInfo)
    {
        $parameters = isset($extraInfo['parameters']) ? $extraInfo['parameters'] : array();
        $this->deleteOverridesOf(isset($parameters['login']) ? $this->resolveLogin($parameters['login']) : '', $returnedValue);
    }

    /** "Copy dashboard to user" creates a dashboard for that user: as onDashboardCreated(). */
    public function onDashboardCopied(&$returnedValue, $extraInfo)
    {
        $parameters = isset($extraInfo['parameters']) ? $extraInfo['parameters'] : array();
        $this->deleteOverridesOf(isset($parameters['copyToUser']) ? $this->resolveLogin($parameters['copyToUser']) : '', $returnedValue);
    }

    private function deleteOverridesOf($login, $idDashboard)
    {
        $idDashboard = (int) $idDashboard;
        if ($login === '' || $login === null || $idDashboard < 1) {
            return;
        }
        $this->getWidgetSettingsDao()->deleteForDashboard($login, $idDashboard);
    }

    /** Test seam: lets unit tests substitute a fake DAO. */
    protected function getWidgetSettingsDao()
    {
        return new Dao\WidgetSettings();
    }

    /** Test seam: the current login needs Matomo's container. */
    protected function getCurrentLogin()
    {
        return Piwik::getCurrentUserLogin();
    }

    /**
     * A login from a request or another plugin, as Matomo stores it: the caller may write it in another case, and this
     * plugin compares logins exactly. Unknown logins stay as given.
     */
    private function resolveLogin($login)
    {
        $login = (string) $login;
        if ($login === '') {
            return '';
        }
        $stored = $this->canonicalLogin($login);

        return $stored !== '' ? $stored : $login;
    }

    /**
     * The stored login of the Matomo user $login resolves to, '' when there is none. When the lookup itself fails, the
     * login counts as existing (returned as given), so a cleanup never removes rows on a doubtful answer.
     */
    protected function canonicalLogin($login)
    {
        try {
            $user = $this->findUser((string) $login);

            return is_array($user) && isset($user['login']) ? (string) $user['login'] : '';
        } catch (\Throwable $e) {
            return (string) $login;
        }
    }

    /** Test seam: Matomo's user row for $login (false or [] when there is none). */
    protected function findUser($login)
    {
        return (new UsersModel())->getUser($login);
    }

    /**
     * A deleted site can never be viewed again, so its per-site widget overrides are dead rows.
     * Only the widget settings are per-site.
     */
    public function deleteSite($idSite)
    {
        (new Dao\WidgetSettings())->deleteForSite($idSite);
    }
}
