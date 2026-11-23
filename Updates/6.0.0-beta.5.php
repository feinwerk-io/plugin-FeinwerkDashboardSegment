<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment;

use Piwik\Plugins\FeinwerkDashboardSegment\Dao\WidgetSettings;
use Piwik\Updater;
use Piwik\Updater\Migration\Factory as MigrationFactory;
use Piwik\Updates as PiwikUpdates;

/**
 * Gives `login` of the widget settings table the binary collation of its character set, so two Matomo users whose
 * logins the old collation compared as equal ("Anna" and "anna") get separate keys. Rows stored under a user's login in
 * another case ("BOB" for "bob") are moved to that login first. Checks the column first: nothing to do (and no
 * migration shown) when it already compares exactly or the table does not exist. Not a log table, so no
 * major update. The 5.x line has the same change as Updates/5.1.0.php.
 */
class Updates_6_0_0_beta_5 extends PiwikUpdates
{
    /** @var MigrationFactory */
    private $migration;

    public function __construct(MigrationFactory $factory)
    {
        $this->migration = $factory;
    }

    public function getMigrations(Updater $updater)
    {
        $dao = new WidgetSettings();
        $type = $dao->exactLoginColumnType();
        if ($type === null) {
            return array();
        }

        // first, while the old collation still matches them, move rows stored under a user's login in another case to
        // that login: with the binary collation they would no longer reach their owner
        $migrations = array();
        foreach ($dao->loginsToRewrite() as $stored => $login) {
            $migrations[] = $this->migration->db->boundSql($dao->rewriteLoginSql(), array($login, $stored));
        }
        $migrations[] = $this->migration->db->changeColumnType('dashboard_widget_settings', 'login', $type);

        return $migrations;
    }

    public function doUpdate(Updater $updater)
    {
        $updater->executeMigrations(__FILE__, $this->getMigrations($updater));
    }
}
