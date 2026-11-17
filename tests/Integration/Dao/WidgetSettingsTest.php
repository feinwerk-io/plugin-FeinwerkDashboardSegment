<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Integration\Dao;

use Piwik\Common;
use Piwik\Db;
use Piwik\Plugins\FeinwerkDashboardSegment\Dao\WidgetSettings;
use Piwik\Tests\Framework\TestCase\IntegrationTestCase;

/**
 * @group FeinwerkDashboardSegment
 */
class WidgetSettingsTest extends IntegrationTestCase
{
    /** @var WidgetSettings */
    private $dao;

    public function setUp(): void
    {
        parent::setUp();
        $this->dao = new WidgetSettings();
        $this->dao->install();
    }

    public function test_install_createsTable()
    {
        $table = Common::prefixTable('dashboard_widget_settings');
        $row = Db::fetchOne("SHOW TABLES LIKE '" . $table . "'");
        $this->assertSame($table, $row);
    }

    public function test_setSegment_thenGetAllForDashboard_returnsValue()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'referrerType==search');

        $all = $this->dao->getAllForDashboard('alice', 5, 1);
        $this->assertSame('referrerType==search', $all['widgetA']['segment']);
        $this->assertNull($all['widgetA']['period']);
    }

    public function test_setPeriod_thenGetAllForDashboard_returnsValue()
    {
        $this->dao->setPeriod('alice', 5, 1, 'widgetA', 'range', 'last30');

        $all = $this->dao->getAllForDashboard('alice', 5, 1);
        $this->assertSame('range', $all['widgetA']['period']);
        $this->assertSame('last30', $all['widgetA']['date']);
        $this->assertNull($all['widgetA']['segment']);
    }

    public function test_segmentAndPeriod_coexistOnOneRow()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'referrerType==search');
        $this->dao->setPeriod('alice', 5, 1, 'widgetA', 'year', 'today');

        $all = $this->dao->getAllForDashboard('alice', 5, 1);
        $this->assertSame('referrerType==search', $all['widgetA']['segment']);
        $this->assertSame('year', $all['widgetA']['period']);
        $this->assertSame('today', $all['widgetA']['date']);
    }

    public function test_clearSegment_keepsRowIfPeriodRemains_elseDeletes()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'referrerType==search');
        $this->dao->setPeriod('alice', 5, 1, 'widgetA', 'year', 'today');

        $this->dao->clearSegment('alice', 5, 1, 'widgetA');
        $all = $this->dao->getAllForDashboard('alice', 5, 1);
        $this->assertArrayHasKey('widgetA', $all); // period override keeps the row
        $this->assertNull($all['widgetA']['segment']);

        $this->dao->clearPeriod('alice', 5, 1, 'widgetA');
        $this->assertSame([], $this->dao->getAllForDashboard('alice', 5, 1)); // now empty -> removed
    }

    public function test_isScopedByLoginDashboardAndSite()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'aaa');
        $this->dao->setSegment('bob', 5, 1, 'widgetA', 'bbb');
        $this->dao->setSegment('alice', 9, 1, 'widgetA', 'ccc');
        $this->dao->setSegment('alice', 5, 2, 'widgetA', 'ddd');

        $this->assertSame('aaa', $this->dao->getAllForDashboard('alice', 5, 1)['widgetA']['segment']);
        $this->assertSame('ddd', $this->dao->getAllForDashboard('alice', 5, 2)['widgetA']['segment']);
    }

    public function test_deleteAllForUser_removesEverythingForLogin()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'aaa');
        $this->dao->setSegment('bob', 5, 1, 'widgetA', 'ccc');

        $this->dao->deleteAllForUser('alice');

        $this->assertSame([], $this->dao->getAllForDashboard('alice', 5, 1));
        $this->assertSame('ccc', $this->dao->getAllForDashboard('bob', 5, 1)['widgetA']['segment']);
    }

    public function test_deleteForSite_removesOnlyThatSite()
    {
        $this->dao->setSegment('alice', 5, 1, 'widgetA', 'site1');
        $this->dao->setSegment('alice', 5, 2, 'widgetA', 'site2');
        $this->dao->setSegment('bob', 9, 1, 'widgetB', 'site1too');

        $this->dao->deleteForSite(1);

        $this->assertSame([], $this->dao->getAllForDashboard('alice', 5, 1));
        $this->assertSame([], $this->dao->getAllForDashboard('bob', 9, 1));
        $this->assertSame('site2', $this->dao->getAllForDashboard('alice', 5, 2)['widgetA']['segment']);
    }

    /**
     * "Anna" and "anna" are two Matomo users. A case-insensitive collation of the table (Matomo 5.0 created it with the
     * server's default) matches both logins. The test table gets such a collation, whatever the test server's default
     * is; the skip remains only for a database that cannot convert it.
     */
    private function conflateAnnaOrSkip()
    {
        $table = Common::prefixTable('dashboard_widget_settings');
        try {
            Db::query("ALTER TABLE `$table` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
        } catch (\Exception $e) {
            $this->markTestSkipped('the test table cannot be given a case-insensitive collation: ' . $e->getMessage());
        }
        $this->dao->setSegment('Anna', 41, 1, 'widgetA', 'referrerType==search');
        if ((int) Db::fetchOne("SELECT COUNT(*) FROM `$table` WHERE `login` = 'anna'") === 0) {
            $this->markTestSkipped('the test database compares logins case-sensitively: no conflation to guard against');
        }
    }

    public function test_conflatedLogins_doNotReadEachOthersOverrides()
    {
        $this->conflateAnnaOrSkip();

        $this->assertSame([], $this->dao->getAllForDashboard('anna', 41, 1));
        $this->assertSame('referrerType==search', $this->dao->getAllForDashboard('Anna', 41, 1)['widgetA']['segment']);
    }

    public function test_conflatedLogins_anUpsertNeverOverwritesTheOtherUsersRow()
    {
        $this->conflateAnnaOrSkip();

        foreach (['segment' => function () {
            $this->dao->setSegment('anna', 41, 1, 'widgetA', 'browserCode==ff');
        }, 'period' => function () {
            $this->dao->setPeriod('anna', 41, 1, 'widgetA', 'range', 'last7');
        }] as $what => $write) {
            try {
                $write();
                $this->fail('the ' . $what . ' upsert must refuse a key that another login holds');
            } catch (\PHPUnit\Framework\AssertionFailedError $e) {
                throw $e;
            } catch (\Exception $e) {
                $this->assertStringContainsString('another user', $e->getMessage());
            }
        }

        $row = $this->dao->getAllForDashboard('Anna', 41, 1)['widgetA'];
        $this->assertSame('referrerType==search', $row['segment']);
        $this->assertNull($row['period']);
    }

    public function test_conflatedLogins_clearAndDeleteTouchOnlyTheExactLogin()
    {
        $this->conflateAnnaOrSkip();

        $this->dao->clearSegment('anna', 41, 1, 'widgetA');
        $this->dao->clearPeriod('anna', 41, 1, 'widgetA');
        $this->dao->deleteForDashboard('anna', 41);
        $this->dao->deleteAllForUser('anna');

        $this->assertSame('referrerType==search', $this->dao->getAllForDashboard('Anna', 41, 1)['widgetA']['segment']);

        $this->dao->deleteAllForUser('Anna');
        $this->assertSame([], $this->dao->getAllForDashboard('Anna', 41, 1));
    }

    public function test_conflatedLogins_aCopyReadsOnlyTheExactSourceLogin()
    {
        $this->conflateAnnaOrSkip();

        $this->dao->copyForDashboard('anna', 41, 'bob', 42);
        $this->assertSame([], $this->dao->getAllForDashboard('bob', 42, 1));

        $this->dao->copyForDashboard('Anna', 41, 'bob', 42);
        $this->assertSame('referrerType==search', $this->dao->getAllForDashboard('bob', 42, 1)['widgetA']['segment']);
    }

    public function test_conflatedLogins_aCopyNeverWritesIntoAKeyAnotherLoginHolds()
    {
        $this->conflateAnnaOrSkip();
        $this->dao->setSegment('bob', 5, 1, 'widget0', 'browserCode==ff'); // sorts before the held key
        $this->dao->setSegment('bob', 5, 1, 'widgetA', 'deviceType==smartphone');

        try {
            $this->dao->copyForDashboard('bob', 5, 'anna', 41);
            $this->fail('the copy must refuse a target key that another login holds');
        } catch (\PHPUnit\Framework\AssertionFailedError $e) {
            throw $e;
        } catch (\Exception $e) {
            $this->assertStringContainsString('another user', $e->getMessage());
            $this->assertStringNotContainsString('Anna', $e->getMessage());
        }

        $this->assertSame([], $this->dao->getAllForDashboard('anna', 41, 1), 'nothing is copied, not even the free key');
        $this->assertSame('referrerType==search', $this->dao->getAllForDashboard('Anna', 41, 1)['widgetA']['segment']);

        $this->dao->copyForDashboard('bob', 5, 'anna', 42);
        $this->assertCount(2, $this->dao->getAllForDashboard('anna', 42, 1));
    }

    public function test_conflatedLogins_storedLoginsMatchingGivesEverySpelling()
    {
        $this->conflateAnnaOrSkip();
        $this->dao->setSegment('anna', 42, 1, 'widgetA', 'browserCode==ff');

        $logins = $this->dao->storedLoginsMatching('ANNA');
        sort($logins);
        $this->assertSame(['Anna', 'anna'], $logins);
    }

    public function test_install_givesLoginTheBinaryCollation()
    {
        $this->assertNull($this->dao->exactLoginColumnType(), 'install() leaves nothing for the update to do');

        $this->dao->setSegment('Anna', 41, 1, 'widgetA', 'referrerType==search');
        $this->dao->setSegment('anna', 41, 1, 'widgetA', 'browserCode==ff');
        $this->assertSame('referrerType==search', $this->dao->getAllForDashboard('Anna', 41, 1)['widgetA']['segment']);
        $this->assertSame('browserCode==ff', $this->dao->getAllForDashboard('anna', 41, 1)['widgetA']['segment']);
    }

    public function test_theUpdate_givesAnExistingTableTheBinaryCollation_once()
    {
        $this->conflateAnnaOrSkip(); // the table as Matomo 5.0 created it on a case-insensitive server, "Anna" on 41

        $update = $this->loginCollationUpdate();
        $updater = $this->createMock(\Piwik\Updater::class);
        $migrations = $update->getMigrations($updater);
        $this->assertCount(1, $migrations);
        foreach ($migrations as $migration) {
            $migration->exec();
        }

        // "anna" now gets her own key on the same dashboard, and Anna's row stays as it was
        $this->dao->setSegment('anna', 41, 1, 'widgetA', 'browserCode==ff');
        $this->assertSame('referrerType==search', $this->dao->getAllForDashboard('Anna', 41, 1)['widgetA']['segment']);
        $this->assertSame('browserCode==ff', $this->dao->getAllForDashboard('anna', 41, 1)['widgetA']['segment']);
        $this->assertSame([], $update->getMigrations($updater), 'a second run has nothing to do');

        // the user-deletion cleanup still finds every spelling of a login
        $logins = $this->dao->storedLoginsMatching('ANNA');
        sort($logins);
        $this->assertSame(['Anna', 'anna'], $logins);
    }

    public function test_theUpdate_movesRowsStoredUnderAUsersLoginInAnotherCase()
    {
        $this->conflateAnnaOrSkip(); // "Anna" is no Matomo user here: her row stays as it is
        (new \Piwik\Plugins\UsersManager\Model())->addUser('bob', 'not-a-real-hash', 'bob@example.com', \Piwik\Date::now()->getDatetime());
        $this->dao->setSegment('BOB', 7, 1, 'widgetB', 'browserCode==ff'); // e.g. a dashboard copied to a login typed "BOB"
        $this->assertSame(['BOB' => 'bob'], $this->dao->loginsToRewrite());

        $update = $this->loginCollationUpdate();
        $updater = $this->createMock(\Piwik\Updater::class);
        $migrations = $update->getMigrations($updater);
        $this->assertCount(2, $migrations, 'one rewrite, then the collation');
        foreach ($migrations as $migration) {
            $migration->exec();
        }

        $this->assertSame('browserCode==ff', $this->dao->getAllForDashboard('bob', 7, 1)['widgetB']['segment']);
        $this->assertSame([], $this->dao->getAllForDashboard('BOB', 7, 1));
        $this->assertSame('referrerType==search', $this->dao->getAllForDashboard('Anna', 41, 1)['widgetA']['segment']);
        $this->assertSame([], $update->getMigrations($updater));
    }

    /** this branch's update with the login collation (its file name is the branch's own version) */
    private function loginCollationUpdate()
    {
        $files = array_values(array_filter(glob(__DIR__ . '/../../../Updates/*.php'), function ($file) {
            return strpos((string) file_get_contents($file), 'exactLoginColumnType') !== false;
        }));
        $this->assertCount(1, $files);
        require_once $files[0];
        $class = 'Piwik\\Plugins\\FeinwerkDashboardSegment\\Updates_' . strtolower(str_replace(['-', '.'], '_', basename($files[0], '.php')));

        return new $class(\Piwik\Container\StaticContainer::get(\Piwik\Updater\Migration\Factory::class));
    }

    public function test_storedLoginsMatching_givesTheStoredSpelling()
    {
        $this->dao->setSegment('Anna', 43, 1, 'widgetA', 'referrerType==search');

        $this->assertSame(['Anna'], $this->dao->storedLoginsMatching('Anna'));
        $this->assertSame([], $this->dao->storedLoginsMatching('nobody'));
    }
}
