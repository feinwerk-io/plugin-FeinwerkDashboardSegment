<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Unit;

use PHPUnit\Framework\TestCase;
use Piwik\Plugins\FeinwerkDashboardSegment\Dao\WidgetSettings;
use Piwik\Plugins\FeinwerkDashboardSegment\FeinwerkDashboardSegment;

/**
 * Logins that reach the plugin from a request or another plugin are resolved to Matomo's stored spelling before the
 * exact comparison of the table; the user-deletion cleanup removes only the deleted user's rows, also when the event
 * carries the login in another case and the table conflates two users ("Anna" and "anna").
 *
 * @group FeinwerkDashboardSegment
 */
class LoginExactnessTest extends TestCase
{
    /** @var object fake DAO recording calls */
    private $dao;
    /** @var FeinwerkDashboardSegment */
    private $plugin;
    /** @var array<string,string> login as given => stored login of the user it resolves to (missing = no such user) */
    private $users = array();

    protected function setUp(): void
    {
        parent::setUp();
        $this->dao = new class extends WidgetSettings {
            public $calls = array();
            public $stored = array();
            public function __construct()
            {
            }
            public function deleteForDashboard($login, $idDashboard)
            {
                $this->calls[] = array('deleteForDashboard', $login, (int) $idDashboard);
            }
            public function copyForDashboard($fromLogin, $fromIdDashboard, $toLogin, $toIdDashboard)
            {
                $this->calls[] = array('copyForDashboard', $fromLogin, (int) $fromIdDashboard, $toLogin, (int) $toIdDashboard);
            }
            public function storedLoginsMatching($login)
            {
                return $this->stored;
            }
            public function deleteAllForUser($login)
            {
                $this->calls[] = array('deleteAllForUser', $login);
            }
        };
        $dao = $this->dao;
        $users = &$this->users;
        $this->plugin = (new \ReflectionClass(new class ($dao, $users) extends FeinwerkDashboardSegment {
            private $fakeDao;
            private $fakeUsers;
            public function __construct($dao = null, &$users = array())
            {
                $this->fakeDao = $dao;
                $this->fakeUsers = &$users;
            }
            protected function getWidgetSettingsDao()
            {
                return $this->fakeDao;
            }
            protected function getCurrentLogin()
            {
                return 'anna';
            }
            public $lookupFails = false;
            protected function findUser($login)
            {
                if ($this->lookupFails) {
                    throw new \RuntimeException('the users table cannot be read');
                }
                return isset($this->fakeUsers[$login]) ? array('login' => $this->fakeUsers[$login]) : false;
            }
        }))->newInstanceArgs(array($dao, &$users));
    }

    public function test_a_login_from_the_dashboard_api_is_resolved_to_the_stored_spelling(): void
    {
        $this->users = array('ANNA' => 'anna');
        $value = null;
        $this->plugin->onDashboardRemoved($value, array('parameters' => array('login' => 'ANNA', 'idDashboard' => '4')));

        $this->assertSame(array(array('deleteForDashboard', 'anna', 4)), $this->dao->calls);
    }

    public function test_an_unknown_login_stays_as_given(): void
    {
        $value = 7;
        $this->plugin->onDashboardCopied($value, array('parameters' => array('copyToUser' => 'nobody')));

        $this->assertSame(array(array('deleteForDashboard', 'nobody', 7)), $this->dao->calls);
    }

    public function test_the_logins_of_a_sharing_copy_are_resolved(): void
    {
        $this->users = array('Bob' => 'bob', 'ANNA' => 'anna');
        $this->plugin->onCopyWidgetOverrides('Bob', 3, 'ANNA', 9);

        $this->assertSame(array(
            array('deleteForDashboard', 'anna', 9),
            array('copyForDashboard', 'bob', 3, 'anna', 9),
        ), $this->dao->calls);
    }

    /** "Anna" and "anna" are two users; the table returns both for either login. */
    public function test_deleting_a_user_keeps_the_rows_of_another_user_the_table_conflates(): void
    {
        $this->dao->stored = array('Anna', 'anna');
        $this->users = array('Anna' => 'Anna'); // anna is deleted, Anna still exists

        $this->plugin->deleteUser('anna');

        $this->assertSame(array(array('deleteAllForUser', 'anna')), $this->dao->calls);
    }

    /** The event may carry the deleted login in another case than the stored one. */
    public function test_deleting_a_user_given_in_another_case_removes_their_rows(): void
    {
        $this->dao->stored = array('Anna', 'anna');
        $this->users = array('Anna' => 'Anna'); // anna is deleted, Anna still exists

        $this->plugin->deleteUser('ANNA');

        $this->assertSame(array(array('deleteAllForUser', 'anna')), $this->dao->calls);
    }

    /** A stored spelling that Matomo resolves to the deleted login belongs to that user. */
    public function test_deleting_a_user_removes_a_stored_spelling_that_resolves_to_them(): void
    {
        $this->dao->stored = array('ANNA');
        $this->users = array('ANNA' => 'anna');

        $this->plugin->deleteUser('anna');

        $this->assertSame(array(array('deleteAllForUser', 'ANNA')), $this->dao->calls);
    }

    /** A stored spelling that Matomo resolves to another existing user is that user's. */
    public function test_deleting_a_user_keeps_a_stored_spelling_that_resolves_to_another_user(): void
    {
        $this->dao->stored = array('Strasse');
        $this->users = array('Strasse' => 'strasse'); // Straße is deleted, strasse still exists

        $this->plugin->deleteUser('Straße');

        $this->assertSame(array(), $this->dao->calls);
    }

    /** When Matomo's user lookup fails, another spelling counts as an existing user: its rows stay. */
    public function test_deleting_a_user_keeps_other_spellings_when_the_user_lookup_fails(): void
    {
        $this->dao->stored = array('Anna', 'anna');
        $this->plugin->lookupFails = true;

        $this->plugin->deleteUser('anna');

        $this->assertSame(array(array('deleteAllForUser', 'anna')), $this->dao->calls);
    }
}
